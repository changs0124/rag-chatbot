package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 스트리밍 중 대화가 삭제되면 답을 조용히 버린다(#437).
 *
 * <p>변경 전에는 생성이 끝난 뒤 답 저장이 외래 키 위반으로 실패해, 지운 대화에 대고 {@code error} 이벤트를 보내고
 * 「처리되지 않은 예외」 ERROR 를 남겼다(10-23 운영 재현). 실 PostgreSQL 이라야 외래 키 위반이 재현된다.
 */
@ExtendWith(OutputCaptureExtension.class)
class ChatConversationDeletedTest extends AbstractPgIntegrationTest {

	@MockitoBean
	OpenAiService openAi;

	@BeforeEach
	void stageLabel() {
		when(openAi.stageLabel(any(), any(), anyBoolean())).thenReturn("단계");
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

	@Test
	@SuppressWarnings("unchecked")
	void conversation_deleted_while_streaming_is_discarded_quietly(CapturedOutput output) throws Exception {
		String token = createUser("deleted-mid-stream@b.com");
		String convId = createConversation(token);
		when(openAi.streamChat(any(), any(), any())).thenAnswer(inv -> {
			((Consumer<String>) inv.getArgument(1)).accept("부분");
			// 다른 탭에서 지운 것과 같다 - 메시지는 cascade 로 함께 지워진다
			jdbc.update("delete from conversations where id = ?", UUID.fromString(convId));
			return new ChatCompletion("끝까지 만든 답", List.of(), true, null, null);
		});

		String body = rawChat(token, convId);

		assertThat(body).contains("event:meta");
		assertThat(body).doesNotContain("event:error");
		assertThat(output).doesNotContain("처리되지 않은 예외");
		assertThat(output).contains("스트리밍 중 대화가 삭제돼 답을 버림");
		assertThat(jdbc.queryForObject("select count(*) from messages where conversation_id = ?", Integer.class,
				UUID.fromString(convId))).isZero();
	}

	/** 모델 호출이 실패한 사이 대화도 지워졌다 - 이벤트 없이 닫되, 원인은 INFO 줄에 남는다 */
	@Test
	@SuppressWarnings("unchecked")
	void upstream_failure_on_deleted_conversation_keeps_cause_in_log(CapturedOutput output) throws Exception {
		String token = createUser("deleted-upstream-fail@b.com");
		String convId = createConversation(token);
		when(openAi.streamChat(any(), any(), any())).thenAnswer(inv -> {
			((Consumer<String>) inv.getArgument(1)).accept("부분");
			jdbc.update("delete from conversations where id = ?", UUID.fromString(convId));
			throw new IllegalStateException("upstream boom after delete");
		});

		String body = rawChat(token, convId);

		assertThat(body).doesNotContain("event:error");
		assertThat(output).doesNotContain("처리되지 않은 예외");
		assertThat(output).contains("스트리밍 중 대화가 삭제돼 답을 버림").contains("upstream boom after delete");
	}
}
