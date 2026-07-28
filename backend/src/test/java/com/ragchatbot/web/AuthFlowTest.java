package com.ragchatbot.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
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

	// --- AC-2 : 위조 · 만료 · 서명 불일치 -------------------------------------
	// 위 forged 테스트는 형식이 깨진 문자열이라 디코딩 단계에서 죽음 - 서명 검증에 도달하지 않아,
	// verify() 를 decode() 로 바꿔도 초록이었음(2026-07-28 Phase 2 리뷰 H1). 아래 3건이 실제 검증 지점임.

	private static final String TEST_SECRET = "test-secret-please-change-0123456789abcdef";

	private HttpStatus meStatusWith(String token) {
		var headers = new HttpHeaders();
		headers.setBearerAuth(token);
		return (HttpStatus) rest.exchange(ME, HttpMethod.GET, new HttpEntity<>(headers), Map.class).getStatusCode();
	}

	private static com.auth0.jwt.JWTCreator.Builder authClaims() {
		return JWT.create()
				.withAudience("auth")
				.withSubject(UUID.randomUUID().toString())
				.withClaim("email", "sig@b.com");
	}

	/** 다른 시크릿으로 정상 서명한 well-formed 토큰 - 서명 검증이 없으면 통과해 버림 */
	@Test
	void me_with_wrong_secret_signature_401() {
		String token = authClaims()
				.withIssuedAt(Instant.now())
				.withExpiresAt(Instant.now().plusSeconds(600))
				.sign(Algorithm.HMAC256("another-secret-0123456789abcdefghijkl"));
		assertThat(meStatusWith(token)).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	/** 우리 시크릿으로 정상 서명했으나 이미 만료된 토큰 */
	@Test
	void me_with_expired_token_401() {
		String token = authClaims()
				.withIssuedAt(Instant.now().minusSeconds(7200))
				.withExpiresAt(Instant.now().minusSeconds(60))
				.sign(Algorithm.HMAC256(TEST_SECRET));
		assertThat(meStatusWith(token)).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	/** 정상 서명 토큰의 payload(sub)만 바꿔치기 - 서명은 그대로라 서명 검증만이 잡을 수 있음 */
	@Test
	void me_with_tampered_payload_401() {
		String good = authClaims()
				.withIssuedAt(Instant.now())
				.withExpiresAt(Instant.now().plusSeconds(600))
				.sign(Algorithm.HMAC256(TEST_SECRET));
		String[] parts = good.split("\\.");
		String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
		String tampered = payload.replaceFirst("\"sub\":\"[^\"]+\"",
				"\"sub\":\"" + UUID.randomUUID() + "\"");
		String repacked = Base64.getUrlEncoder().withoutPadding()
				.encodeToString(tampered.getBytes(StandardCharsets.UTF_8));
		assertThat(meStatusWith(parts[0] + "." + repacked + "." + parts[2]))
				.isEqualTo(HttpStatus.UNAUTHORIZED);
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
