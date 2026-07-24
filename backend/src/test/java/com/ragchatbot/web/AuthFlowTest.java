package com.ragchatbot.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * Phase 2 인증 플로우 (공유 싱글턴 PostgreSQL).
 * AC-2(위조 JWT 401) · AC-3(미인증 401) · AC-4(BCrypt 저장).
 */
class AuthFlowTest extends AbstractPgIntegrationTest {

	private static final String SIGNUP = "/api/auth/signup";
	private static final String LOGIN = "/api/auth/login";
	private static final String ME = "/api/auth/me";

	record Signup(String email, String password, String name) {
	}

	record Login(String email, String password) {
	}

	@Test
	void health_is_public() {
		var res = rest.getForEntity("/api/health", Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody().get("status")).isEqualTo("ok");
	}

	@Test
	void signup_login_me_flow() {
		var signup = rest.postForEntity(SIGNUP, new Signup("auth-a@b.com", "password123", "홍길동"), Map.class);
		assertThat(signup.getStatusCode()).isEqualTo(HttpStatus.OK);
		String token = (String) signup.getBody().get("token");
		assertThat(token).isNotBlank();

		var headers = new HttpHeaders();
		headers.setBearerAuth(token);
		var me = rest.exchange(ME, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
		assertThat(me.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(me.getBody().get("email")).isEqualTo("auth-a@b.com");

		var login = rest.postForEntity(LOGIN, new Login("auth-a@b.com", "password123"), Map.class);
		assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
	}

	@Test
	void duplicate_email_409() {
		rest.postForEntity(SIGNUP, new Signup("auth-dup@b.com", "password123", "이름"), Map.class);
		var res = rest.postForEntity(SIGNUP, new Signup("auth-dup@b.com", "password123", "이름2"), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
	}

	@Test
	void wrong_password_401() {
		rest.postForEntity(SIGNUP, new Signup("auth-wp@b.com", "password123", "이름"), Map.class);
		var res = rest.postForEntity(LOGIN, new Login("auth-wp@b.com", "wrongpassword"), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void me_without_token_401() {
		var res = rest.getForEntity(ME, Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void me_with_forged_token_401() {
		var headers = new HttpHeaders();
		headers.setBearerAuth("forged.jwt.value");
		var res = rest.exchange(ME, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void password_stored_as_bcrypt_hash() {
		rest.postForEntity(SIGNUP, new Signup("auth-hash@b.com", "password123", "이름"), Map.class);
		String hash = jdbc.queryForObject("select password_hash from users where email = ?", String.class,
				"auth-hash@b.com");
		assertThat(hash).isNotEqualTo("password123");
		assertThat(hash).startsWith("$2"); // BCrypt 접두
	}
}
