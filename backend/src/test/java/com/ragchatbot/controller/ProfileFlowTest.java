package com.ragchatbot.controller;

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
		String token = createUser("prof-name@b.com");
		var res = patch(token, "/api/profile/name", Map.of("name", "새이름"), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody().get("name")).isEqualTo("새이름");

		var me = rest.exchange("/api/profile", HttpMethod.GET, new HttpEntity<>(bearer(token)), Map.class);
		assertThat(me.getBody().get("name")).isEqualTo("새이름");
	}

	@SuppressWarnings("rawtypes")
	@Test
	void update_password_changes_login() {
		String temporary = issueAccount("prof-pw@b.com");
		String token = login("prof-pw@b.com", temporary);
		var changed = patch(token, "/api/profile/password",
				Map.of("currentPassword", temporary, "newPassword", "newpassword1"), Map.class);
		assertThat(changed.getStatusCode()).isEqualTo(HttpStatus.OK);

		var newLogin = rest.postForEntity("/api/auth/login",
				Map.of("email", "prof-pw@b.com", "password", "newpassword1"), Map.class);
		assertThat(newLogin.getStatusCode()).isEqualTo(HttpStatus.OK);

		var oldLogin = rest.postForEntity("/api/auth/login",
				Map.of("email", "prof-pw@b.com", "password", temporary), Map.class);
		assertThat(oldLogin.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	/**
	 * 변경 응답이 새 토큰을 주고, 그 토큰으로 세션이 이어져야 함.
	 *
	 * <p>변경 시각 이전 토큰이 전부 무효가 되면서 <b>변경을 수행한 본인도 로그아웃</b>되던 회귀를 막음 -
	 * "변경했습니다"를 띄운 직후 다음 요청부터 401 이었음(재리뷰 지적 1).
	 */
	@SuppressWarnings("rawtypes")
	@Test
	void update_password_returns_usable_token() {
		String temporary = issueAccount("prof-pw3@b.com");
		String oldToken = login("prof-pw3@b.com", temporary);
		var changed = patch(oldToken, "/api/profile/password",
				Map.of("currentPassword", temporary, "newPassword", "newpassword1"), Map.class);
		assertThat(changed.getStatusCode()).isEqualTo(HttpStatus.OK);

		// 같은 초에 발급되면 클레임이 모두 같아 문자열까지 동일할 수 있음 - "다른 값"이 아니라
		// **쓸 수 있는 값**인지가 이 테스트의 요지임
		String newToken = (String) changed.getBody().get("token");
		assertThat(newToken).isNotBlank();

		var withNew = rest.exchange("/api/profile", HttpMethod.GET, new HttpEntity<>(bearer(newToken)), Map.class);
		assertThat(withNew.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(withNew.getBody().get("email")).isEqualTo("prof-pw3@b.com");
	}

	@Test
	void update_password_wrong_current_401() {
		String token = createUser("prof-pw2@b.com");
		var res = patch(token, "/api/profile/password",
				Map.of("currentPassword", "wrongpassword", "newPassword", "newpassword1"), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	@SuppressWarnings("unchecked")
	void update_theme_valid_and_invalid() {
		String token = createUser("prof-theme@b.com");
		var ok = patch(token, "/api/profile/theme", Map.of("theme", "dark"), Map.class);
		assertThat(ok.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(ok.getBody().get("theme")).isEqualTo("dark");

		var bad = patch(token, "/api/profile/theme", Map.of("theme", "rainbow"), Map.class);
		assertThat(bad.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}
}
