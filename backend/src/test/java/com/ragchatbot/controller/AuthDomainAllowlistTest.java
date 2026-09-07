package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 가입 도메인 화이트리스트 HTTP 계약 (FEAT-AUTH-001 · TC-AUTH-001 · 002 · 008 · 011).
 *
 * <p>판정 자체는 {@code SignupPolicyTest} 가 단위로 본다. 여기서는 <b>상태 코드와 검사 순서</b>,
 * 그리고 거절이 DB 에 흔적을 남기지 않는지를 본다.
 */
@TestPropertySource(properties = "app.auth.allowed-email-domains=company.com")
class AuthDomainAllowlistTest extends AbstractPgIntegrationTest {

	@SuppressWarnings("rawtypes")
	private ResponseEntity<Map> signupRaw(String email) {
		return rest.postForEntity("/api/auth/signup",
				Map.of("email", email, "password", "password123", "name", "사용자"), Map.class);
	}

	private int countByEmail(String email) {
		return jdbc.queryForObject("select count(*) from users where email = ?", Integer.class, email);
	}

	/** TC-AUTH-001 : 허용 도메인은 가입된다 */
	@SuppressWarnings("unchecked")
	@Test
	void allowed_domain_can_sign_up() {
		var res = signupRaw("hong@company.com");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat((String) res.getBody().get("token")).isNotBlank();
	}

	/** TC-AUTH-002 : 허용 도메인 밖은 400이고 행이 생기지 않는다 */
	@SuppressWarnings("unchecked")
	@Test
	void outside_domain_is_rejected_and_leaves_no_row() {
		var res = signupRaw("someone@gmail.com");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		// 허용 도메인을 밝혀야 사용자가 무엇을 고쳐야 하는지 안다
		assertThat((String) res.getBody().get("message")).contains("company.com");
		assertThat(countByEmail("someone@gmail.com")).isZero();
	}

	/** TC-AUTH-003 : 대소문자가 달라도 허용 도메인으로 인정된다 */
	@Test
	void domain_match_is_case_insensitive() {
		var res = signupRaw("Hong.Case@Company.COM");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(countByEmail("hong.case@company.com")).isEqualTo(1);
	}

	/**
	 * TC-AUTH-008 : 도메인 검사가 중복 검사보다 먼저다.
	 *
	 * <p>순서가 뒤집히면 거절할 주소에 대해 409(이미 가입됨)를 돌려주게 되어 <b>계정 존재 여부가 샌다.</b>
	 * 정책 도입 이전에 만들어진 계정을 흉내내려고 DB 에 직접 넣는다 - 지금은 API 로 만들 수 없기 때문이다.
	 */
	@SuppressWarnings("unchecked")
	@Test
	void domain_check_runs_before_duplicate_check() {
		jdbc.update("insert into users (email, password_hash, name) values (?, ?, ?)",
				"legacy@gmail.com", "$2a$10$notarealhashnotarealhashnotarealhashnotarealhash", "옛계정");

		var res = signupRaw("legacy@gmail.com");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat((String) res.getBody().get("code")).isEqualTo("BAD_REQUEST");
	}

	/** 허용 도메인이면 중복은 종전대로 409다 - 도메인 검사가 409 경로를 삼키지 않아야 한다 */
	@Test
	void duplicate_inside_allowed_domain_is_still_conflict() {
		signupRaw("dup@company.com");

		var second = signupRaw("dup@company.com");

		assertThat(second.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
	}

	/**
	 * TC-AUTH-011 : 기존 도메인 밖 계정은 로그인이 계속 된다.
	 *
	 * <p>검사는 가입 시점에만 한다. 로그인에서도 막으면 정책 도입 이전에 정당하게 만들어진 계정이
	 * 통째로 잠기는데, 치울 수단(계정 삭제)이 없다. <b>감수하는 약점을 케이스로 고정해 둔다.</b>
	 */
	@SuppressWarnings("rawtypes")
	@Test
	void existing_outside_domain_account_can_still_log_in() {
		// 정책 도입 전에 만들어진 계정을 흉내냄 - 해시는 password123 의 실제 BCrypt 값이어야 함
		String hash = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder()
				.encode("password123");
		jdbc.update("insert into users (email, password_hash, name) values (?, ?, ?)",
				"grandfathered@gmail.com", hash, "옛사용자");

		ResponseEntity<Map> login = rest.postForEntity("/api/auth/login",
				Map.of("email", "grandfathered@gmail.com", "password", "password123"), Map.class);

		assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
	}
}
