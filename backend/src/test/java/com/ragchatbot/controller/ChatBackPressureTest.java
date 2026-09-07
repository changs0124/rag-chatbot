package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * back-pressure 거절이 <b>{@code prepare} 앞</b>에서 일어나는지 잼(2026-07-28 결정).
 *
 * <p>{@code prepare} 는 사용자 메시지를 저장하므로, 거절이 그 뒤로 밀리면 <b>답변 없는 사용자
 * 메시지</b>가 대화에 남음. 순서를 바꾸면 이 테스트가 빨간불이 됨.
 *
 * <p>상한을 0 으로 두어 <b>모든 요청이 거절되는</b> 상태를 만듦 - 동시 요청을 실제로 띄우면
 * 목업이 너무 빨라 타이밍에 기대게 되고, 그런 테스트는 CI 에서 흔들림.
 */
@TestPropertySource(properties = "app.chat.max-concurrent-per-user=0")
class ChatBackPressureTest extends AbstractPgIntegrationTest {

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private String createConversation(String token) {
		var res = rest.exchange("/api/conversations", HttpMethod.POST,
				new HttpEntity<>(Map.of("title", "대화"), bearer(token)), Map.class);
		return (String) res.getBody().get("id");
	}

	@Test
	void rejected_by_backpressure_returns_429() {
		String token = createUser("bp-429@b.com");
		String convId = createConversation(token);

		var res = rest.exchange("/api/chat", HttpMethod.POST,
				new HttpEntity<>(Map.of("conversationId", convId, "message", "안녕"), bearer(token)), Map.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
	}

	@Test
	void rejected_request_leaves_no_orphan_user_message() {
		String token = createUser("bp-orphan@b.com");
		String convId = createConversation(token);

		rest.exchange("/api/chat", HttpMethod.POST,
				new HttpEntity<>(Map.of("conversationId", convId, "message", "안녕"), bearer(token)), Map.class);

		var messages = rest.exchange("/api/conversations/" + convId + "/messages", HttpMethod.GET,
				new HttpEntity<>(bearer(token)), List.class);
		assertThat(messages.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(messages.getBody()).isEmpty();
	}
}
