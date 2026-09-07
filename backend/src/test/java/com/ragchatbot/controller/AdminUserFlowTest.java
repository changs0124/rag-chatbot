package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.ragchatbot.repository.UserRepository;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 관리자에 의한 사용자 관리 (FEAT-ADMIN-003 · TC-ADMIN-030~034 · 006).
 */
class AdminUserFlowTest extends AbstractPgIntegrationTest {

	@Autowired
	private UserRepository userRepository;

	private String createAdminUser(String email) {
		String token = createUser(email);
		userRepository.promoteAdmins(List.of(email));
		return token;
	}

	private UUID idOf(String email) {
		return jdbc.queryForObject("select id from users where email = ?", UUID.class, email);
	}

	@SuppressWarnings("rawtypes")
	private ResponseEntity<Map> reset(String token, UUID targetId) {
		return rest.exchange("/api/admin/users/" + targetId + "/password-reset", HttpMethod.POST,
				new HttpEntity<>(bearer(token)), Map.class);
	}

	/**
	 * 계정 발급은 관리자만 할 수 있다(FEAT-AUTH-001).
	 *
	 * <p>403 이 아니라 <b>404</b> 다 - 관리 기능의 존재 자체를 드러내지 않는 이 컨트롤러의 규칙(P-3)이
	 * 새 엔드포인트에도 적용되는지를 본다. 여기만 403 이면 경로의 존재가 새어 규칙이 무너진다.
	 */
	@SuppressWarnings("rawtypes")
	@Test
	void plain_user_cannot_issue_accounts() {
		String plainToken = createUser("issue-intruder@b.com");

		ResponseEntity<Map> res = rest.exchange("/api/admin/users", HttpMethod.POST,
				new HttpEntity<>(Map.of("email", "issue-victim@b.com", "name", "피해자"), bearer(plainToken)),
				Map.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		Integer created = jdbc.queryForObject("select count(*) from users where email = ?", Integer.class,
				"issue-victim@b.com");
		assertThat(created).isZero();
	}

	/**
	 * 발급된 계정은 <b>일반 사용자</b>다 - 관리자 명단에 없는 주소이므로.
	 *
	 * <p>발급하는 쪽이 관리자라는 이유로 받는 쪽까지 관리자가 되면, 계정 하나 만들 때마다 관리 권한이
	 * 번지고 그 사실이 화면 어디에도 보이지 않는다.
	 */
	@Test
	void issued_account_is_a_plain_user() {
		createUser("issue-role@b.com");

		String role = jdbc.queryForObject("select role from users where email = ?", String.class,
				"issue-role@b.com");

		assertThat(role).isEqualTo("user");
	}

	/** TC-ADMIN-030 : 임시 비밀번호가 1회 반환된다 */
	@SuppressWarnings("unchecked")
	@Test
	void admin_gets_temporary_password_once() {
		String adminToken = createAdminUser("reset-admin@b.com");
		createUser("reset-target@b.com");

		var res = reset(adminToken, idOf("reset-target@b.com"));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat((String) res.getBody().get("temporaryPassword")).isNotBlank();
	}

	/** TC-ADMIN-031 : 발급된 값으로 로그인된다 */
	@SuppressWarnings({ "unchecked", "rawtypes" })
	@Test
	void temporary_password_works_for_login() {
		String adminToken = createAdminUser("reset-admin2@b.com");
		createUser("reset-login@b.com");
		String temporary = (String) reset(adminToken, idOf("reset-login@b.com")).getBody()
				.get("temporaryPassword");

		ResponseEntity<Map> login = rest.postForEntity("/api/auth/login",
				Map.of("email", "reset-login@b.com", "password", temporary), Map.class);

		assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
	}

	/**
	 * TC-ADMIN-032 : 초기화 직후 대상의 기존 토큰이 무효가 된다.
	 *
	 * <p>기존 `password_changed_at` 무효화 규칙을 그대로 타는지 보는 케이스다.
	 * 안 타면 계정 탈취 대응이 성립하지 않는다.
	 */
	@SuppressWarnings("rawtypes")
	@Test
	void reset_invalidates_target_existing_tokens() {
		String adminToken = createAdminUser("reset-admin3@b.com");
		String targetToken = createUser("reset-kick@b.com");
		// 초기화 전에는 멀쩡히 쓰인다
		assertThat(rest.exchange("/api/auth/me", HttpMethod.GET, new HttpEntity<>(bearer(targetToken)),
				Map.class).getStatusCode()).isEqualTo(HttpStatus.OK);

		reset(adminToken, idOf("reset-kick@b.com"));

		ResponseEntity<Map> after = rest.exchange("/api/auth/me", HttpMethod.GET,
				new HttpEntity<>(bearer(targetToken)), Map.class);
		assertThat(after.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	/** TC-ADMIN-033 : 두 번 초기화하면 값이 다르다 - 난수가 고정값이 아님 */
	@SuppressWarnings("unchecked")
	@Test
	void two_resets_produce_different_passwords() {
		String adminToken = createAdminUser("reset-admin4@b.com");
		createUser("reset-twice@b.com");
		UUID target = idOf("reset-twice@b.com");

		String first = (String) reset(adminToken, target).getBody().get("temporaryPassword");
		String second = (String) reset(adminToken, target).getBody().get("temporaryPassword");

		assertThat(first).isNotEqualTo(second);
	}

	/** TC-ADMIN-034 : 일반 사용자는 남의 비밀번호를 초기화할 수 없다 */
	@Test
	void plain_user_cannot_reset_others() {
		createUser("reset-victim@b.com");
		String plainToken = createUser("reset-intruder@b.com");

		var res = reset(plainToken, idOf("reset-victim@b.com"));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	/** 자기 자신은 대상이 아니다 - 마이페이지에 변경 기능이 이미 있고, 자기 세션을 스스로 끊을 이유가 없다 */
	@Test
	void admin_cannot_reset_self() {
		String adminToken = createAdminUser("reset-self@b.com");

		var res = reset(adminToken, idOf("reset-self@b.com"));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}

	/** TC-ADMIN-006 : 일반 사용자의 사용자 목록 조회는 404 */
	@Test
	void plain_user_cannot_list_users() {
		String plainToken = createUser("list-plain@b.com");

		// 오류 본문은 ApiError 객체라 List 로 못 받음 - 상태 코드만 보면 되므로 String 으로 받는다
		var res = rest.exchange("/api/admin/users", HttpMethod.GET,
				new HttpEntity<>(bearer(plainToken)), String.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	/** 관리자 목록에는 역할이 실려야 화면이 "관리자/사용자"를 구분해 보여줄 수 있다 */
	@SuppressWarnings({ "unchecked", "rawtypes" })
	@Test
	void user_list_carries_role() {
		String adminToken = createAdminUser("list-admin@b.com");

		ResponseEntity<List> res = rest.exchange("/api/admin/users", HttpMethod.GET,
				new HttpEntity<>(bearer(adminToken)), List.class);

		List<Map<String, Object>> rows = res.getBody();
		assertThat(rows).anySatisfy(r -> {
			assertThat(r.get("email")).isEqualTo("list-admin@b.com");
			assertThat(r.get("role")).isEqualTo("admin");
		});
	}
}
