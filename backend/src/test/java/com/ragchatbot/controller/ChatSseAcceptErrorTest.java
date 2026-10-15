package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * #279 : 채팅을 {@code Accept: text/event-stream} 으로 불러도 거절이 상태 코드 + JSON 으로 나가는지 잼.
 * 변경 전에는 ApiError 를 그 미디어 타입으로 쓸 수 없어 <b>빈 본문 500</b> 이었음(2026-10-15 로컬 재현).
 * 429 는 상한이 달라야 해서 {@link ChatSseAcceptRateLimitTest} 에 따로 둠.
 */
class ChatSseAcceptErrorTest extends AbstractPgIntegrationTest {

	static HttpHeaders sse(HttpHeaders h) {
		h.setAccept(List.of(MediaType.TEXT_EVENT_STREAM));
		return h;
	}

	static void assertJsonError(ResponseEntity<String> res, HttpStatus status, String code) {
		assertThat(res.getStatusCode()).isEqualTo(status);
		assertThat(res.getHeaders().getContentType()).isNotNull();
		assertThat(res.getHeaders().getContentType().isCompatibleWith(MediaType.APPLICATION_JSON)).isTrue();
		assertThat(res.getBody()).contains("\"code\":\"" + code + "\"");
	}

	@Test
	void empty_message_with_sse_accept_is_400_json() {
		String token = createUser("sse-400@b.com");
		String convId = createConversation(token);

		var res = rest.exchange("/api/chat", HttpMethod.POST,
				new HttpEntity<>(Map.of("conversationId", convId, "message", ""), sse(bearer(token))), String.class);

		assertJsonError(res, HttpStatus.BAD_REQUEST, "BAD_REQUEST");
	}

	@Test
	void unknown_conversation_with_sse_accept_is_404_json() {
		String token = createUser("sse-404@b.com");

		var res = rest.exchange("/api/chat", HttpMethod.POST,
				new HttpEntity<>(Map.of("conversationId", UUID.randomUUID().toString(), "message", "안녕"),
						sse(bearer(token))),
				String.class);

		assertJsonError(res, HttpStatus.NOT_FOUND, "NOT_FOUND");
	}
}
