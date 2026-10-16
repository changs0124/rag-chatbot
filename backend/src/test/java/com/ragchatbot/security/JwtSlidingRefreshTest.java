package com.ragchatbot.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 세션 슬라이딩 재발급 (FEAT-OPS-003 · TC-OPS-020~024).
 *
 * <p>토큰 수명을 <b>임계와 같게</b> 잡아 발급 즉시 "만료 임박" 상태가 되게 함 - 30분을 실제로
 * 흘려보내는 검사는 시각에 의존해 게이트가 되지 못함(CONVENTIONS 규칙).
 */
@TestPropertySource(properties = {
		"app.jwt.expiration-minutes=30",
		"app.jwt.refresh-threshold-minutes=30" })
class JwtSlidingRefreshTest extends AbstractPgIntegrationTest {

	@Autowired
	private CorsConfigurationSource corsConfigurationSource;

	@Value("${app.jwt.secret}")
	private String jwtSecret;

	@SuppressWarnings("rawtypes")
	private org.springframework.http.ResponseEntity<Map> me(String token) {
		return rest.exchange("/api/auth/me", HttpMethod.GET, new HttpEntity<>(bearer(token)), Map.class);
	}

	/** TC-OPS-020 : 만료가 가까우면 새 토큰이 헤더로 온다 */
	@Test
	void near_expiry_token_gets_refreshed() {
		String token = createUser("slide-near@b.com");
		var res = me(token);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		String refreshed = res.getHeaders().getFirst(JwtAuthenticationFilter.REFRESH_HEADER);
		assertThat(refreshed).isNotBlank();
	}

	/**
	 * TC-OPS-022 : 재발급된 토큰으로 인증된다.
	 *
	 * <p>헤더가 오기만 하고 쓸 수 없는 값이면 아무 소용이 없으므로, 값의 존재가 아니라
	 * <b>사용 가능성</b>을 본다(비밀번호 변경 토큰 검사와 같은 판단).
	 */
	@Test
	void refreshed_token_authenticates() {
		String token = createUser("slide-usable@b.com");
		String refreshed = me(token).getHeaders().getFirst(JwtAuthenticationFilter.REFRESH_HEADER);

		var res = me(refreshed);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody().get("email")).isEqualTo("slide-usable@b.com");
	}

	/** 로그인 · 갱신으로 새로 나가는 토큰에 email 클레임이 없다(#328) - 읽는 곳 없이 bearer 마다 개인정보를 실었다 */
	@Test
	void new_and_refreshed_tokens_carry_no_email_claim() {
		String token = createUser("slide-noemail@b.com");
		String refreshed = me(token).getHeaders().getFirst(JwtAuthenticationFilter.REFRESH_HEADER);

		assertThat(JWT.decode(token).getClaim("email").isMissing()).isTrue();
		assertThat(JWT.decode(refreshed).getClaim("email").isMissing()).isTrue();
	}

	/**
	 * email 클레임이 든 옛 형식 토큰도 인증 · 갱신을 통과한다(#328). 배포 시점에 이미 나가 있는 토큰이
	 * 한꺼번에 401 이 되면 전원이 강제 로그아웃된다. 갱신본에는 email 이 옮겨 적히지 않는다.
	 *
	 * <p>iat 는 실제 로그인 토큰 것을 그대로 쓴다 - 비밀번호 변경 기준 시각 검사가 클레임 모양과 무관하게
	 * 같은 판정을 내리도록, 다른 것은 email 클레임 하나뿐이게 한다.
	 */
	@Test
	void legacy_token_with_email_claim_authenticates_and_refreshes() {
		DecodedJWT current = JWT.decode(createUser("slide-legacy@b.com"));
		String legacy = JWT.create()
				.withAudience("auth")
				.withSubject(current.getSubject())
				.withClaim("email", "slide-legacy@b.com")
				.withIssuedAt(current.getIssuedAtAsInstant())
				.withExpiresAt(Instant.now().plusSeconds(600))
				.sign(Algorithm.HMAC256(jwtSecret));

		var res = me(legacy);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody().get("email")).isEqualTo("slide-legacy@b.com");
		String refreshed = res.getHeaders().getFirst(JwtAuthenticationFilter.REFRESH_HEADER);
		assertThat(refreshed).isNotBlank();
		assertThat(JWT.decode(refreshed).getClaim("email").isMissing()).isTrue();
		assertThat(me(refreshed).getStatusCode()).isEqualTo(HttpStatus.OK);
	}

	/** 무효한 토큰은 갱신해 주지 않는다 - 갱신해 주면 만료가 무의미해진다 */
	@Test
	void invalid_token_is_not_refreshed() {
		var res = me("not-a-real-token");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
		assertThat(res.getHeaders().getFirst(JwtAuthenticationFilter.REFRESH_HEADER)).isNull();
	}

	/**
	 * TC-OPS-024 : 노출 헤더에 재발급 헤더가 등록돼 있다.
	 *
	 * <p>등록하지 않으면 서버는 정상 발급하는데 브라우저가 값을 숨겨 프론트가 못 읽는다 -
	 * <b>조용히 아무 일도 일어나지 않는</b> 형태라 다른 검사로는 절대 드러나지 않는다.
	 */
	@Test
	void refresh_header_is_exposed_to_browser() {
		var request = new org.springframework.mock.web.MockHttpServletRequest("GET", "/api/auth/me");
		CorsConfiguration config = corsConfigurationSource.getCorsConfiguration(request);

		assertThat(config).isNotNull();
		assertThat(config.getExposedHeaders()).contains(JwtAuthenticationFilter.REFRESH_HEADER);
	}

}
