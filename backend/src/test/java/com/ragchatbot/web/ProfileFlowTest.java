package com.ragchatbot.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * Phase 6c 마이페이지 - 이름/비밀번호/테마 변경 (AC-15·16).
 */
class ProfileFlowTest extends AbstractPgIntegrationTest {

	private <T> org.springframework.http.ResponseEntity<T> patch(String token, String path, Object body,
			Class<T> type) {
		return rest.exchange(path, HttpMethod.PATCH, new HttpEntity<>(body, bearer(token)), type);
	}

	@Test
	@SuppressWarnings("unchecked")
	void update_name_is_reflected() {
		String token = signup("prof-name@b.com");
		var res = patch(token, "/api/profile/name", Map.of("name", "새이름"), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody().get("name")).isEqualTo("새이름");

		var me = rest.exchange("/api/profile", HttpMethod.GET, new HttpEntity<>(bearer(token)), Map.class);
		assertThat(me.getBody().get("name")).isEqualTo("새이름");
	}

	@Test
	void update_password_changes_login() {
		String token = signup("prof-pw@b.com");
		var changed = patch(token, "/api/profile/password",
				Map.of("currentPassword", "password123", "newPassword", "newpassword1"), Void.class);
		assertThat(changed.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

		var newLogin = rest.postForEntity("/api/auth/login",
				Map.of("email", "prof-pw@b.com", "password", "newpassword1"), Map.class);
		assertThat(newLogin.getStatusCode()).isEqualTo(HttpStatus.OK);

		var oldLogin = rest.postForEntity("/api/auth/login",
				Map.of("email", "prof-pw@b.com", "password", "password123"), Map.class);
		assertThat(oldLogin.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void update_password_wrong_current_401() {
		String token = signup("prof-pw2@b.com");
		var res = patch(token, "/api/profile/password",
				Map.of("currentPassword", "wrongpassword", "newPassword", "newpassword1"), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	@SuppressWarnings("unchecked")
	void update_theme_valid_and_invalid() {
		String token = signup("prof-theme@b.com");
		var ok = patch(token, "/api/profile/theme", Map.of("theme", "dark"), Map.class);
		assertThat(ok.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(ok.getBody().get("theme")).isEqualTo("dark");

		var bad = patch(token, "/api/profile/theme", Map.of("theme", "rainbow"), Map.class);
		assertThat(bad.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}
}
