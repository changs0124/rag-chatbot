package com.ragchatbot.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * AC-1 : 사용자 A의 리소스에 B가 접근하면 전 경로에서 404(존재 은닉, P-3).
 */
class ConversationCrossAccessTest extends AbstractPgIntegrationTest {

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private String createConversation(String token) {
		var res = rest.exchange("/api/conversations", HttpMethod.POST,
				new HttpEntity<>(Map.of("title", "A의 대화"), bearer(token)), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		return (String) res.getBody().get("id");
	}

	@Test
	void owner_can_access_stranger_gets_404() {
		String tokenA = signup("owner@b.com");
		String tokenB = signup("stranger@b.com");
		String convId = createConversation(tokenA);

		// A - 메시지 조회 200
		var aMessages = rest.exchange("/api/conversations/" + convId + "/messages", HttpMethod.GET,
				new HttpEntity<>(bearer(tokenA)), List.class);
		assertThat(aMessages.getStatusCode()).isEqualTo(HttpStatus.OK);

		// B - 메시지 조회 404
		var bMessages = rest.exchange("/api/conversations/" + convId + "/messages", HttpMethod.GET,
				new HttpEntity<>(bearer(tokenB)), Map.class);
		assertThat(bMessages.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

		// B - 삭제 404
		var bDelete = rest.exchange("/api/conversations/" + convId, HttpMethod.DELETE,
				new HttpEntity<>(bearer(tokenB)), Map.class);
		assertThat(bDelete.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

		// B 목록엔 A의 대화가 없음
		var bList = rest.exchange("/api/conversations", HttpMethod.GET,
				new HttpEntity<>(bearer(tokenB)), List.class);
		assertThat(bList.getBody()).isEmpty();
	}

	@Test
	void owner_can_delete_own() {
		String tokenA = signup("del@b.com");
		String convId = createConversation(tokenA);
		var del = rest.exchange("/api/conversations/" + convId, HttpMethod.DELETE,
				new HttpEntity<>(bearer(tokenA)), Void.class);
		assertThat(del.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
		// 삭제 후 재조회 404
		var after = rest.exchange("/api/conversations/" + convId + "/messages", HttpMethod.GET,
				new HttpEntity<>(bearer(tokenA)), Map.class);
		assertThat(after.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	@Test
	@SuppressWarnings("unchecked")
	void owner_can_rename() {
		String token = signup("rename@b.com");
		String convId = createConversation(token);
		var res = rest.exchange("/api/conversations/" + convId, HttpMethod.PATCH,
				new HttpEntity<>(Map.of("title", "바뀐 제목"), bearer(token)), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody().get("title")).isEqualTo("바뀐 제목");
	}

	@Test
	void stranger_cannot_rename_404() {
		String owner = signup("rn-owner@b.com");
		String stranger = signup("rn-stranger@b.com");
		String convId = createConversation(owner);
		var res = rest.exchange("/api/conversations/" + convId, HttpMethod.PATCH,
				new HttpEntity<>(Map.of("title", "침입"), bearer(stranger)), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	@Test
	void unauthenticated_conversations_401() {
		var res = rest.getForEntity("/api/conversations", Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}
}
