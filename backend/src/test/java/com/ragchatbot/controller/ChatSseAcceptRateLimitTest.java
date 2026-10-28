package com.ragchatbot.controller;

import static com.ragchatbot.support.SseTestSupport.assertJsonError;
import static com.ragchatbot.support.SseTestSupport.sse;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/** #279 : 거절(429)도 SSE Accept 에서 JSON 으로. 상한 0 으로 모든 요청을 거절시킴(ChatBackPressureTest 와 같은 방식) */
@TestPropertySource(properties = "app.chat.max-concurrent-per-user=0")
class ChatSseAcceptRateLimitTest extends AbstractPgIntegrationTest {

	@Test
	void rejection_with_sse_accept_is_429_json() {
		String token = createUser("sse-429@b.com");
		String convId = createConversation(token);

		var res = rest.exchange("/api/chat", HttpMethod.POST,
				new HttpEntity<>(Map.of("conversationId", convId, "message", "안녕"),
						sse(bearer(token))),
				String.class);

		assertJsonError(res, HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT");
	}
}
