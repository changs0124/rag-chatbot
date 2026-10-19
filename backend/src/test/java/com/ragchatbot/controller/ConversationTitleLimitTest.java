package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 대화 제목 길이 상한(#371, 기본 100자). 생성 · 변경 모두 넘으면 400 이고 잘라 저장하지 않는다.
 * 종전에는 생성은 검증이 없고 변경은 빈 값만 봐서 운영에서 2만 자 제목이 저장됐다.
 * 길이는 trim 뒤 코드 포인트로 센다 - 앞뒤 공백은 저장되지 않으니 세지 않는다.
 */
class ConversationTitleLimitTest extends AbstractPgIntegrationTest {

	@SuppressWarnings("rawtypes")
	private ResponseEntity<Map> create(String token, String title) {
		return rest.exchange("/api/conversations", HttpMethod.POST,
				new HttpEntity<>(Map.of("title", title), bearer(token)), Map.class);
	}

	@SuppressWarnings("rawtypes")
	private ResponseEntity<Map> rename(String token, String convId, String title) {
		return rest.exchange("/api/conversations/" + convId, HttpMethod.PATCH,
				new HttpEntity<>(Map.of("title", title), bearer(token)), Map.class);
	}

	@Test
	void create_over_limit_400() {
		String token = createUser("title-create-long@b.com");

		var res = create(token, "가".repeat(101));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(res.getBody().get("message")).isEqualTo("제목은 100자까지 쓸 수 있음");
		assertThat(jdbc.queryForObject("select count(*) from conversations c join users u on u.id = c.user_id "
				+ "where u.email = ?", Integer.class, "title-create-long@b.com")).isZero();
	}

	@Test
	void rename_over_limit_400_and_title_kept() {
		String token = createUser("title-rename-long@b.com");
		String convId = createConversation(token);

		var res = rename(token, convId, "가".repeat(101));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(res.getBody().get("message")).isEqualTo("제목은 100자까지 쓸 수 있음");
		assertThat(jdbc.queryForObject("select title from conversations where id = ?::uuid", String.class, convId))
				.isEqualTo("대화");
	}

	@Test
	void at_limit_passes_on_create_and_rename() {
		String token = createUser("title-limit@b.com");
		String title = "가".repeat(100);

		var created = create(token, title);
		assertThat(created.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(created.getBody().get("title")).isEqualTo(title);

		var renamed = rename(token, (String) created.getBody().get("id"), "나".repeat(100));
		assertThat(renamed.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(renamed.getBody().get("title")).isEqualTo("나".repeat(100));
	}

	@Test
	void length_counts_code_points_after_trim() {
		String token = createUser("title-limit-cp@b.com");
		String convId = createConversation(token);

		var padded = rename(token, convId, "  " + "가".repeat(100) + " ");
		assertThat(padded.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(padded.getBody().get("title")).isEqualTo("가".repeat(100));

		var emoji = create(token, "😀".repeat(100));
		assertThat(emoji.getStatusCode()).isEqualTo(HttpStatus.OK);
	}
}
