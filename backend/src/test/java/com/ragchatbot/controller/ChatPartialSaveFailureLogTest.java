package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.function.Consumer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.service.ChatPersistenceService;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 오류 뒤 부분 답 저장이 실패해도 흔적이 남는다(#453). 변경 전에는 {@code catch (Exception ignored)} 라 로그가 없었다.
 * 대화는 그대로 있으므로(삭제 #437 과 구분) WARN 이다.
 */
@ExtendWith(OutputCaptureExtension.class)
class ChatPartialSaveFailureLogTest extends AbstractPgIntegrationTest {

	@MockitoBean
	OpenAiService openAi;

	@MockitoSpyBean
	ChatPersistenceService chatPersistence;

	@BeforeEach
	void stageLabel() {
		when(openAi.stageLabel(any(), any(), anyBoolean())).thenReturn("단계");
	}

	@Test
	@SuppressWarnings("unchecked")
	void partial_save_failure_is_logged_as_warn(CapturedOutput output) throws Exception {
		String token = createUser("partial-save-fail@b.com");
		String convId = createConversation(token);
		when(openAi.streamChat(any(), any(), any())).thenAnswer(inv -> {
			((Consumer<String>) inv.getArgument(1)).accept("부분");
			throw new IllegalStateException("upstream boom");
		});
		doThrow(new IllegalStateException("save boom")).when(chatPersistence)
				.saveAssistant(any(), any(), any(), any(), any(), anyBoolean(), anyBoolean(), any(), any(), any());

		var req = HttpRequest.newBuilder(URI.create(rest.getRootUri() + "/api/chat"))
				.timeout(Duration.ofSeconds(10))
				.header("Authorization", "Bearer " + token)
				.header("Content-Type", "application/json")
				.header("Accept", "text/event-stream")
				.POST(HttpRequest.BodyPublishers.ofString(
						"{\"conversationId\":\"" + convId + "\",\"message\":\"안녕\"}"))
				.build();
		HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());

		assertThat(output).contains("부분 답 저장 실패").contains("save boom");
		assertThat(output).doesNotContain("부분 답 저장 생략");
	}
}
