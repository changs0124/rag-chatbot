package com.ragchatbot.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Phase 2 인증 플로우 (Testcontainers, 실 PostgreSQL). Docker 필요.
 * AC-2(위조 JWT 401) · AC-3(미인증 401) · AC-4(BCrypt 저장).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@Testcontainers
@TestPropertySource(properties = "app.jwt.secret=test-secret-please-change-0123456789abcdef")
class AuthFlowTest {

	@Container
	@ServiceConnection
	static PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired
	private TestRestTemplate rest;

	@Autowired
	private JdbcTemplate jdbc;

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
		var signup = rest.postForEntity(SIGNUP, new Signup("a@b.com", "password123", "홍길동"), Map.class);
		assertThat(signup.getStatusCode()).isEqualTo(HttpStatus.OK);
		String token = (String) signup.getBody().get("token");
		assertThat(token).isNotBlank();

		var headers = new HttpHeaders();
		headers.setBearerAuth(token);
		var me = rest.exchange(ME, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
		assertThat(me.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(me.getBody().get("email")).isEqualTo("a@b.com");

		var login = rest.postForEntity(LOGIN, new Login("a@b.com", "password123"), Map.class);
		assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
	}

	@Test
	void duplicate_email_409() {
		rest.postForEntity(SIGNUP, new Signup("dup@b.com", "password123", "이름"), Map.class);
		var res = rest.postForEntity(SIGNUP, new Signup("dup@b.com", "password123", "이름2"), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
	}

	@Test
	void wrong_password_401() {
		rest.postForEntity(SIGNUP, new Signup("wp@b.com", "password123", "이름"), Map.class);
		var res = rest.postForEntity(LOGIN, new Login("wp@b.com", "wrongpassword"), Map.class);
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
		rest.postForEntity(SIGNUP, new Signup("hash@b.com", "password123", "이름"), Map.class);
		String hash = jdbc.queryForObject("select password_hash from users where email = ?", String.class, "hash@b.com");
		assertThat(hash).isNotEqualTo("password123");
		assertThat(hash).startsWith("$2"); // BCrypt 접두
	}
}
