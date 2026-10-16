package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.function.Consumer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.annotation.DirtiesContext;
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
// 목 빈 + 짧은 타임아웃이라 다른 클래스와 컨텍스트를 나눠 쓰지 못한다. 캐시에 남기면 그 Hikari 풀(10)이
// 공유 컨테이너의 연결 상한(100)을 넘겨 뒤 클래스가 「too many clients」로 기동에 실패했다 - 끝나면 닫는다
@DirtiesContext
@TestPropertySource(properties = "app.chat.sse-timeout-ms=300")
class ChatStreamExceptionHandlerTest extends AbstractPgIntegrationTest {

	@MockitoBean
	OpenAiService openAi;

	@BeforeEach
	void stageLabel() {
		// 목은 null 을 돌려주는데 단계 이벤트가 Map.of 로 라벨을 실어 NPE 가 난다 - 다른 경로로 새지 않게 채움
		when(openAi.stageLabel(any(), any())).thenReturn("단계");
	}

	private String rawChat(String token, String convId) throws Exception {
		var req = HttpRequest.newBuilder(URI.create(rest.getRootUri() + "/api/chat"))
				.timeout(Duration.ofSeconds(10))
				.header("Authorization", "Bearer " + token)
				.header("Content-Type", "application/json")
				.header("Accept", "text/event-stream")
				.POST(HttpRequest.BodyPublishers.ofString(
						"{\"conversationId\":\"" + convId + "\",\"message\":\"안녕\"}"))
				.build();
		var res = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
		assertThat(res.statusCode()).isEqualTo(200);
		return res.body();
	}

	/**
	 * TC-OPS-025 : SSE 타임아웃은 WARN 한 줄이고 스트림에 JSON 이 섞이지 않는다.
	 *
	 * <p>첫 토큰 전에 타임아웃(300ms)보다 오래 잔다. 운영에서 업스트림이 응답하지 않는 모양이다.
	 */
	@Test
	void sse_timeout_writes_no_json_and_logs_no_error(CapturedOutput output) throws Exception {
		when(openAi.streamChat(any(), any(), any())).thenAnswer(inv -> {
			Thread.sleep(1500);
			return new ChatCompletion("늦은 답", List.of(), true, null, null);
		});
		String token = createUser("sse-timeout@b.com");

		String body = rawChat(token, createConversation(token));

		assertThat(body).contains("event:meta");
		assertThat(body).doesNotContain("INTERNAL_ERROR");
		assertThat(output).doesNotContain("처리되지 않은 예외");
		assertThat(output).contains("SSE 스트림 타임아웃");
	}

	/**
	 * TC-OPS-026 : 스트림 도중 오류는 {@code error} 이벤트로 끝나고 JSON 이 섞이지 않는다.
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

		String body = rawChat(token, createConversation(token));

		assertThat(body).contains("event:error").contains("STREAM_ERROR");
		assertThat(body).doesNotContain("INTERNAL_ERROR");
		assertThat(output).contains("처리되지 않은 예외").contains("upstream boom");
	}

	/**
	 * TC-OPS-027 : 커밋 전 비동기 타임아웃은 503 JSON, 커밋 뒤에는 아무것도 쓰지 않는다.
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
