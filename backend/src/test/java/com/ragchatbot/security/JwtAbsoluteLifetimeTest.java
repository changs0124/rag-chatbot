package com.ragchatbot.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 슬라이딩 재발급의 절대 수명(#403, 기본 12시간).
 *
 * <p>재발급본이 처음부터 다시 세면, 탈취한 토큰으로 90분에 한 번씩만 요청해도 비밀번호를 바꾸기 전까지 무기한 쓸 수 있다.
 * 그래서 최초 인증 시각({@code auth_time})을 재발급본에 그대로 옮기고, 그로부터 상한이 지나면 더 재발급하지 않는다.
 *
 * <p>{@link JwtSlidingRefreshTest} 와 같이 수명을 임계와 같게 잡아 발급 즉시 「만료 임박」이 되게 한다.
 * 12시간을 실제로 흘려보내지 않고 {@code auth_time} 을 과거로 둔 토큰을 직접 서명한다.
 * iat 는 실제 로그인 토큰 것을 그대로 쓴다 - 초 단위로 잘린 「지금」은 방금 만든 계정의 비밀번호 변경 기준선보다
 * 앞설 수 있어, 401 이 되어 재발급이 없는 이유가 갈린다.
 */
@TestPropertySource(properties = {
		"app.jwt.expiration-minutes=30",
		"app.jwt.refresh-threshold-minutes=30" })
class JwtAbsoluteLifetimeTest extends AbstractPgIntegrationTest {

	@Value("${app.jwt.secret}")
	private String jwtSecret;

	@SuppressWarnings("rawtypes")
	private ResponseEntity<Map> me(String token) {
		return rest.exchange("/api/auth/me", HttpMethod.GET, new HttpEntity<>(bearer(token)), Map.class);
	}

	private String sign(DecodedJWT login, Instant authTime) {
		var builder = JWT.create()
				.withAudience("auth")
				.withSubject(login.getSubject())
				.withIssuedAt(login.getIssuedAtAsInstant())
				.withExpiresAt(Instant.now().plus(10, ChronoUnit.MINUTES));
		if (authTime != null) {
			builder.withClaim("auth_time", authTime.getEpochSecond());
		}
		return builder.sign(Algorithm.HMAC256(jwtSecret));
	}

	/** 상한(12시간)이 지난 세션은 유효 기간 안이어도 재발급하지 않는다 - 이 토큰이 만료되면 재로그인이다 */
	@Test
	void no_refresh_after_absolute_lifetime() {
		DecodedJWT login = JWT.decode(createUser("abs-expired@b.com"));
		String token = sign(login, Instant.now().minus(13, ChronoUnit.HOURS));

		var res = me(token);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getHeaders().getFirst(JwtAuthenticationFilter.REFRESH_HEADER)).isNull();
	}

	/** 상한 안에서는 재발급되고, 재발급본은 처음 인증 시각을 그대로 들고 간다 - 새로 세면 상한이 무의미하다 */
	@Test
	void refreshed_token_keeps_original_auth_time() {
		String login = createUser("abs-keep@b.com");
		long authTime = JWT.decode(login).getClaim("auth_time").asLong();

		String refreshed = me(login).getHeaders().getFirst(JwtAuthenticationFilter.REFRESH_HEADER);

		assertThat(refreshed).isNotBlank();
		assertThat(JWT.decode(refreshed).getClaim("auth_time").asLong()).isEqualTo(authTime);
	}

	/**
	 * auth_time 이 없는 옛 토큰은 iat 를 인증 시각으로 본다. 배포 순간 이미 나가 있는 토큰이 한꺼번에 재발급을 잃으면
	 * 활동 중인 사용자 전원이 두 시간 안에 로그아웃된다. 재발급본에는 그 iat 가 auth_time 으로 옮겨 적힌다
	 */
	@Test
	void legacy_token_without_auth_time_uses_iat() {
		DecodedJWT login = JWT.decode(createUser("abs-legacy@b.com"));
		String legacy = sign(login, null);
		long iat = JWT.decode(legacy).getIssuedAtAsInstant().getEpochSecond();

		String refreshed = me(legacy).getHeaders().getFirst(JwtAuthenticationFilter.REFRESH_HEADER);

		assertThat(refreshed).isNotBlank();
		assertThat(JWT.decode(refreshed).getClaim("auth_time").asLong()).isEqualTo(iat);
	}
}
