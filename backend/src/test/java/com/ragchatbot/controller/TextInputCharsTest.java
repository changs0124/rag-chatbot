package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 저장 · 모델 호출 전에 NUL 과 짝 없는 서로게이트를 거른다(#434).
 *
 * <p>PostgreSQL 은 text 에 0x00 을 넣지 못해, 가운데 NUL 이 든 입력은 다섯 경로 모두 500 이었다(10-23 운영 QA).
 * {@code trim()} 은 끝의 NUL 만 지운다. 짝 없는 서로게이트가 든 채팅은 저장된 뒤 모델 요청 직렬화에서 터져
 * 스트림 오류로 끝났다. 실 PostgreSQL 이라야 변경 전의 500 이 재현된다.
 */
class TextInputCharsTest extends AbstractPgIntegrationTest {

	private static final String WITH_NUL = "가\0나";

	@SuppressWarnings("rawtypes")
	private ResponseEntity<Map> send(String token, HttpMethod method, String path, Map<String, ?> body) {
		return rest.exchange(path, method, new HttpEntity<>(body, bearer(token)), Map.class);
	}

	private int userMessages(String convId) {
		return jdbc.queryForObject("select count(*) from messages where conversation_id = ?::uuid and role = 'user'",
				Integer.class, convId);
	}

	@Test
	void nul_in_conversation_title_is_400_on_create_and_rename() {
		String token = createUser("chars-title@b.com");
		String convId = createConversation(token);

		var created = send(token, HttpMethod.POST, "/api/conversations", Map.of("title", WITH_NUL));
		var renamed = send(token, HttpMethod.PATCH, "/api/conversations/" + convId, Map.of("title", WITH_NUL));

		assertThat(created.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(renamed.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(created.getBody().get("message")).isEqualTo("제목에 쓸 수 없는 문자가 있음 (NUL 또는 깨진 문자)");
		assertThat(jdbc.queryForObject("select count(*) from conversations c join users u on u.id = c.user_id "
				+ "where u.email = ?", Integer.class, "chars-title@b.com")).isEqualTo(1);
		assertThat(jdbc.queryForObject("select title from conversations where id = ?::uuid", String.class, convId))
				.isEqualTo("대화");
	}

	@Test
	void nul_in_name_is_400_on_profile_and_account_issue() {
		String token = createUser("chars-name@b.com");

		var profile = send(token, HttpMethod.PATCH, "/api/profile/name", Map.of("name", WITH_NUL));
		var issued = issueRaw("chars-issued@b.com", WITH_NUL);

		assertThat(profile.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(issued.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(jdbc.queryForObject("select name from users where email = ?", String.class, "chars-name@b.com"))
				.isEqualTo("사용자");
		assertThat(jdbc.queryForObject("select count(*) from users where email = ?", Integer.class,
				"chars-issued@b.com")).isZero();
	}

	@Test
	void nul_in_chat_message_is_400_before_saving() {
		String token = createUser("chars-chat-nul@b.com");
		String convId = createConversation(token);

		var res = send(token, HttpMethod.POST, "/api/chat",
				Map.of("conversationId", convId, "message", "AL.2263" + WITH_NUL, "attachmentIds", List.of()));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(res.getBody().get("message")).isEqualTo("메시지에 쓸 수 없는 문자가 있음 (NUL 또는 깨진 문자)");
		assertThat(userMessages(convId)).isZero();
	}

	@Test
	void lone_surrogate_in_chat_message_is_400_before_saving() {
		String token = createUser("chars-chat-surrogate@b.com");
		String convId = createConversation(token);
		// JSON 텍스트의 이스케이프 그대로 보낸다 - Jackson 이 반쪽 서로게이트 하나짜리 문자열로 읽는다
		String json = "{\"conversationId\":\"" + convId + "\",\"message\":\"\\" + "ud800 AL.2263\",\"attachmentIds\":[]}";
		var headers = bearer(token);
		headers.setContentType(MediaType.APPLICATION_JSON);

		var res = rest.exchange("/api/chat", HttpMethod.POST, new HttpEntity<>(json, headers), Map.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		// JSON 파싱 실패 같은 다른 400 이 아니라 이 검사가 막았는지 본다
		assertThat(res.getBody().get("message")).isEqualTo("메시지에 쓸 수 없는 문자가 있음 (NUL 또는 깨진 문자)");
		assertThat(userMessages(convId)).isZero();
	}

	@Test
	void surrogate_pairs_and_trailing_nul_still_pass() {
		// 이모지는 서로게이트 쌍이라 통과해야 한다. 끝의 NUL 은 trim 이 지우므로 지금처럼 통과한다
		String token = createUser("chars-ok@b.com");

		var res = send(token, HttpMethod.POST, "/api/conversations", Map.of("title", "😀 제목\0"));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody().get("title")).isEqualTo("😀 제목");
	}
}
