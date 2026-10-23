package com.ragchatbot.controller;

import static com.ragchatbot.support.SseTestSupport.rawChat;
import static com.ragchatbot.support.SseTestSupport.stubStageLabel;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;

import com.ragchatbot.exception.GlobalExceptionHandler;
import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 스트림이 열린 뒤의 예외가 범용 폴백에 잡혀 열린 스트림에 JSON 을 쓰지 않는지 (#326).
 *
 * <p>SSE 타임아웃과 {@code emitter.completeWithError} 는 둘 다 비동기 디스패치로 예외 처리기에 간다.
 * 변경 전에는 {@code @ExceptionHandler(Exception.class)} 가 받아 타임아웃마다 ERROR 를 남기고, 이미
 * 커밋된 {@code text/event-stream} 에 500 JSON 을 쓰려 했다. 다른 통합 테스트는 목업 모드라 타임아웃을
 * 한 번도 타지 않아 이 경로가 비어 있었다.
 *
 * <p><b>실 톰캣 위에서 원시 바이트를 읽는다.</b> 스트림 본문에 무엇이 섞였는지가 관심사라
 * TestRestTemplate 의 변환을 거치지 않는다.
 */
@ExtendWith(OutputCaptureExtension.class)
@TestPropertySource(properties = {
		// 도중 오류 케이스(026)가 넉넉히 끝날 만큼 길게 두고, 타임아웃 케이스(025)는 래치로 그보다 오래 붙잡는다
		"app.chat.sse-timeout-ms=2000" })
class ChatStreamExceptionHandlerTest extends AbstractPgIntegrationTest {

	@MockitoBean
	OpenAiService openAi;

	@BeforeEach
	void stageLabel() {
		// 목은 null 을 돌려주는데 단계 이벤트가 Map.of 로 라벨을 실어 NPE 가 난다 - 다른 경로로 새지 않게 채움
		stubStageLabel(openAi);
	}

	/**
	 * TC-OPS-032 : SSE 타임아웃은 WARN 한 줄이고 스트림에 JSON 이 섞이지 않는다.
	 *
	 * <p>첫 토큰 전에 업스트림이 응답하지 않는 모양이다. 시간으로 재지 않고 래치로 붙잡아, 응답이 끝난 뒤에야
	 * 놓는다 - 잠자는 시간과 타임아웃의 대소에 결과가 걸리지 않는다.
	 */
	@Test
	void sse_timeout_writes_no_json_and_logs_no_error(CapturedOutput output) throws Exception {
		CountDownLatch upstream = new CountDownLatch(1);
		when(openAi.streamChat(any(), any(), any())).thenAnswer(inv -> {
			upstream.await(30, TimeUnit.SECONDS);
			return new ChatCompletion("늦은 답", List.of(), true, null, null);
		});
		String token = createUser("sse-timeout@b.com");
		String convId = createConversation(token);

		String body;
		try {
			body = rawChat(rest, token, convId);
		} finally {
			upstream.countDown();
		}

		assertThat(body).contains("event:meta");
		assertThat(body).doesNotContain("INTERNAL_ERROR");
		assertThat(output).doesNotContain("처리되지 않은 예외");
		assertThat(output).contains("비동기 요청 타임아웃");
		awaitTimedOutSave(convId);
	}

	/**
	 * 놓아 준 워커가 저장까지 마칠 때를 기다린다 - 워커 스레드가 테스트(와 컨텍스트)보다 오래 살지 않게 한다.
	 * 뒤늦은 완료라 timed_out=true 로 남는다(#84 갈래 ②)
	 */
	private void awaitTimedOutSave(String convId) throws InterruptedException {
		long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
		while (System.nanoTime() < deadline) {
			Integer n = jdbc.queryForObject(
					"select count(*) from messages where conversation_id = ? and role = 'assistant' and timed_out",
					Integer.class, UUID.fromString(convId));
			if (n != null && n > 0) {
				return;
			}
			Thread.sleep(50);
		}
		throw new AssertionError("타임아웃 뒤 워커가 저장을 마치지 않음");
	}

	/**
	 * TC-OPS-033 : 스트림 도중 오류는 {@code error} 이벤트로 끝나고 JSON 이 섞이지 않는다.
	 *
	 * <p>ERROR 로그는 남아야 한다 - {@code completeWithError} 경로에서는 이 로그가 실제 원인의
	 * 유일한 서버 기록이다.
	 */
	@Test
	@SuppressWarnings("unchecked")
	void stream_failure_keeps_error_log_but_writes_no_json(CapturedOutput output) throws Exception {
		when(openAi.streamChat(any(), any(), any())).thenAnswer(inv -> {
			((Consumer<String>) inv.getArgument(1)).accept("부분");
			throw new IllegalStateException("upstream boom");
		});
		String token = createUser("sse-fail@b.com");

		String body = rawChat(rest, token, createConversation(token));

		assertThat(body).contains("event:error").contains("STREAM_ERROR");
		assertThat(body).doesNotContain("INTERNAL_ERROR");
		assertThat(output).contains("처리되지 않은 예외").contains("upstream boom");
	}

	/**
	 * TC-OPS-034 : 커밋 전 비동기 타임아웃은 503 JSON, 커밋 뒤에는 아무것도 쓰지 않는다.
	 *
	 * <p>SSE 는 헤더를 먼저 내보내 늘 커밋돼 있으므로 HTTP 로는 앞 갈래를 만들 수 없다. 처리기를 직접 부른다.
	 */
	@Test
	void async_timeout_handler_branches_on_commit() {
		var handler = new GlobalExceptionHandler();
		var request = new MockHttpServletRequest("POST", "/api/chat");

		var fresh = new MockHttpServletResponse();
		var res = handler.handleAsyncTimeout(new AsyncRequestTimeoutException(), request, fresh);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
		assertThat(res.getBody().code()).isEqualTo("SERVICE_UNAVAILABLE");

		var committed = new MockHttpServletResponse();
		committed.setCommitted(true);
		assertThat(handler.handleAsyncTimeout(new AsyncRequestTimeoutException(), request, committed)).isNull();
	}
}
