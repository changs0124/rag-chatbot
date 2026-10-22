package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 마이페이지 - 이름/비밀번호/테마 변경.
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

		var me = rest.exchange("/api/auth/me", HttpMethod.GET, new HttpEntity<>(bearer(token)), Map.class);
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
	 * "변경했습니다"를 띄운 직후 다음 요청부터 401 이었음.
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

		var withNew = rest.exchange("/api/auth/me", HttpMethod.GET, new HttpEntity<>(bearer(newToken)), Map.class);
		assertThat(withNew.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(withNew.getBody().get("email")).isEqualTo("prof-pw3@b.com");
	}

	/**
	 * TC-AUTH-012 : 새 비밀번호가 UTF-8 72바이트를 넘으면 400 이다(#359).
	 *
	 * <p>BCrypt 는 72바이트를 넘는 입력을 {@code encode} 에서 던져, 막지 않으면 500 이 된다. 글자 수 검증(8자 이상)만으로는
	 * 못 막는다 - 한글 25자가 75바이트다.
	 */
	@Test
	void update_password_over_72_bytes_is_400() {
		String temporary = issueAccount("prof-pw-long@b.com");
		String token = login("prof-pw-long@b.com", temporary);
		var res = patch(token, "/api/profile/password",
				Map.of("currentPassword", temporary, "newPassword", "가".repeat(25)), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

		// 바뀌지 않았다 - 옛 비밀번호로 여전히 들어간다
		var oldLogin = rest.postForEntity("/api/auth/login",
				Map.of("email", "prof-pw-long@b.com", "password", temporary), Map.class);
		assertThat(oldLogin.getStatusCode()).isEqualTo(HttpStatus.OK);
	}

	@Test
	void update_password_wrong_current_401() {
		String token = createUser("prof-pw2@b.com");
		var res = patch(token, "/api/profile/password",
				Map.of("currentPassword", "wrongpassword", "newPassword", "newpassword1"), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	/**
	 * 테마 전환은 #191 에서 걷었다 - 화면이 라이트 하나다. 경로가 되살아나거나 응답에 theme 이 다시 실리면
	 * 프론트에 읽는 코드가 없는 값이 생긴다. 셋 다 같은 사용자의 응답으로 본다.
	 */
	@Test
	@SuppressWarnings("unchecked")
	void theme_is_gone_from_api() {
		String token = createUser("prof-theme@b.com");
		var gone = patch(token, "/api/profile/theme", Map.of("theme", "dark"), Map.class);
		assertThat(gone.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

		var me = rest.exchange("/api/auth/me", HttpMethod.GET, new HttpEntity<>(bearer(token)), Map.class);
		assertThat(me.getBody()).doesNotContainKey("theme").containsKey("role");
	}

	/**
	 * 프로필 조회는 {@code GET /api/auth/me} 하나다(#303). {@code GET /api/profile} 은 같은 처리를 부르는
	 * 두 번째 경로였고 화면이 쓰지 않았다 - 되살아나면 같은 계약을 두 곳에서 지켜야 한다.
	 */
	@Test
	void get_profile_route_is_gone() {
		String token = createUser("prof-get@b.com");
		var res = rest.exchange("/api/profile", HttpMethod.GET, new HttpEntity<>(bearer(token)), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	/**
	 * 표시 이름은 50자(trim 뒤 코드 포인트)까지다(#413). 수 MB 이름이 저장되면 /api/auth/me · 사용자 목록 ·
	 * 문서 목록이 매번 그만큼 커진다. 51자는 400 이고 <b>저장되지 않는다</b>.
	 */
	@Test
	void name_over_50_chars_is_rejected_and_not_saved() {
		String token = createUser("prof-long@b.com");
		var res = patch(token, "/api/profile/name", Map.of("name", "가".repeat(51)), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

		Integer saved = jdbc.queryForObject("select count(*) from users where name = ?", Integer.class,
				"가".repeat(51));
		assertThat(saved).isZero();
	}

	/** 이모지는 UTF-16 으로 두 칸이지만 한 자로 센다 - 이모지 49 + 한글 1 = 50자는 통과, trim 도 먼저 걷는다 */
	@Test
	void name_of_50_code_points_is_accepted() {
		String token = createUser("prof-fifty@b.com");
		String fifty = "😀".repeat(49) + "가";
		var res = patch(token, "/api/profile/name", Map.of("name", " " + fifty + " "), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody().get("name")).isEqualTo(fifty);
	}
}
