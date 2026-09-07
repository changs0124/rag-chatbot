package com.ragchatbot.controller;

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

	record Login(String email, String password) {
	}

	@Test
	void health_is_public() {
		var res = rest.getForEntity("/api/health", Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody().get("status")).isEqualTo("ok");
	}

	/**
	 * 가입 경로가 <b>존재하지 않는다</b>(FEAT-AUTH-001, 2026-09-07).
	 *
	 * <p>404 가 아니라 401 인 것이 중요하다 - 컨트롤러에서 지웠어도 SecurityConfig 의 permitAll 에
	 * 남아 있으면 필터를 통과해 404 가 되므로, <b>401 이어야 두 곳 모두에서 사라진 것</b>이다.
	 */
	@Test
	void signup_endpoint_is_gone() {
		var res = rest.postForEntity(SIGNUP,
				Map.of("email", "auth-new@b.com", "password", "password123", "name", "홍길동"), Map.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void issued_account_can_login_and_read_me() {
		String token = createUser("auth-a@b.com");

		var headers = new HttpHeaders();
		headers.setBearerAuth(token);
		var me = rest.exchange(ME, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
		assertThat(me.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(me.getBody().get("email")).isEqualTo("auth-a@b.com");
	}

	@Test
	void wrong_password_401() {
		createUser("auth-wp@b.com");
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

	// --- 2026-07-28 보안 보강 : 이메일 정규화 · 로그인 상한 · 비밀번호 변경 시 토큰 무효화 ---

	/** 대문자로 발급해도 저장은 소문자 - 같은 주소가 대소문자만 달라 별개 계정이 되는 것을 막음 */
	@Test
	void email_is_normalized_to_lowercase() {
		String temporary = issueAccount("Auth-Case@B.com");

		Integer stored = jdbc.queryForObject("select count(*) from users where email = ?", Integer.class,
				"auth-case@b.com");
		assertThat(stored).isEqualTo(1);

		// 소문자로도, 다시 대문자로도 같은 계정으로 로그인됨
		assertThat(rest.postForEntity(LOGIN, new Login("auth-case@b.com", temporary), Map.class)
				.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(rest.postForEntity(LOGIN, new Login("AUTH-CASE@b.com", temporary), Map.class)
				.getStatusCode()).isEqualTo(HttpStatus.OK);
	}

	@Test
	void duplicate_email_differing_only_in_case_409() {
		issueAccount("auth-dupcase@b.com");
		var res = issueRaw("Auth-DupCase@B.com", "이름2");
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
	}

	/**
	 * 로그인 대입 상한 - 테스트 프로퍼티로 분당 3회.
	 *
	 * <p><b>고정 윈도우라 분 경계에서 카운터가 리셋됨.</b> 종전에는 정확히 3회 틀린 뒤 4번째를 검사했는데,
	 * 그 사이 경계가 굴러가면 4번째는 새 창의 첫 시도라 통과했음(ChatFlowTest 와 같은 부류).
	 *
	 * <p>그래서 <b>실제로 429가 관측될 때까지</b> 틀린 시도를 보냄 - 429를 받았다는 것이 곧 지금 창에
	 * 상한만큼 쌓였다는 증거임. 그 직후에 맞는 비밀번호를 넣어 <b>비밀번호가 맞아도 막히는지</b>를 검사함.
	 */
	@Test
	void login_attempts_are_rate_limited() {
		String temporary = issueAccount("auth-rl@b.com");
		int perMinute = 3;

		boolean blocked = false;
		for (int i = 0; i < perMinute * 2 + 1 && !blocked; i++) {
			var wrong = rest.postForEntity(LOGIN, new Login("auth-rl@b.com", "nope-wrong"), Map.class);
			assertThat(wrong.getStatusCode())
					.as("틀린 비밀번호는 401 이거나, 상한을 넘었으면 429")
					.isIn(HttpStatus.UNAUTHORIZED, HttpStatus.TOO_MANY_REQUESTS);
			blocked = wrong.getStatusCode() == HttpStatus.TOO_MANY_REQUESTS;
		}
		assertThat(blocked).as("틀린 시도를 반복하면 상한에 걸려야 함").isTrue();

		// 한도를 넘으면 비밀번호가 맞아도 통과시키지 않음
		var over = rest.postForEntity(LOGIN, new Login("auth-rl@b.com", temporary), Map.class);
		assertThat(over.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
	}

	/** 성공한 로그인은 상한을 소모하지 않음 - 정상 사용자가 여러 번 로그인해도 잠기면 안 됨 */
	@Test
	void successful_logins_are_not_rate_limited() {
		String temporary = issueAccount("auth-rl-ok@b.com");
		for (int i = 0; i < 6; i++) { // 하한(3)의 두 배
			assertThat(rest.postForEntity(LOGIN, new Login("auth-rl-ok@b.com", temporary), Map.class)
					.getStatusCode()).isEqualTo(HttpStatus.OK);
		}
	}

	/**
	 * 비밀번호 변경 시각 이전에 발급된 토큰은 만료 전이라도 거부됨.
	 *
	 * <p>변경 엔드포인트를 부르는 대신 기준선을 직접 옮김 - 가입과 변경이 <b>같은 초</b>에 일어나면
	 * 초 눈금이 같아져 판정이 갈리므로, 엔드포인트로 하면 결과가 시각에 따라 달라짐. 엔드포인트가
	 * 기준선을 실제로 올리는지는 아래 {@code password_change_bumps_marker}가 따로 잠금.
	 */
	@Test
	void token_issued_before_password_change_is_rejected() {
		String token = createUser("auth-revoke@b.com");
		assertThat(meStatusWith(token)).isEqualTo(HttpStatus.OK);

		jdbc.update("update users set password_changed_at = now() + interval '1 second' where email = ?",
				"auth-revoke@b.com");

		assertThat(meStatusWith(token)).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void password_change_bumps_marker() {
		String temporary = issueAccount("auth-bump@b.com");
		String token = login("auth-bump@b.com", temporary);
		// 발급 시각과 확실히 갈리도록 기준선을 과거로 내려 둠(초 눈금 경계 의존 제거)
		jdbc.update("update users set password_changed_at = now() - interval '1 hour' where email = ?",
				"auth-bump@b.com");

		var res = rest.exchange("/api/profile/password", HttpMethod.PATCH,
				new HttpEntity<>(Map.of("currentPassword", temporary, "newPassword", "newpassword123"),
						bearer(token)),
				Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK); // 새 토큰을 함께 돌려줌

		Integer bumped = jdbc.queryForObject(
				"select count(*) from users where email = ? and password_changed_at > now() - interval '1 minute'",
				Integer.class, "auth-bump@b.com");
		assertThat(bumped).isEqualTo(1);
	}

	@Test
	void password_stored_as_bcrypt_hash() {
		String temporary = issueAccount("auth-hash@b.com");
		String hash = jdbc.queryForObject("select password_hash from users where email = ?", String.class,
				"auth-hash@b.com");
		assertThat(hash).isNotEqualTo(temporary);
		assertThat(hash).startsWith("$2"); // BCrypt 접두
	}
}
