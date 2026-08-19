package com.ragchatbot.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 만료가 아직 먼 토큰 (FEAT-OPS-003 · TC-OPS-021).
 *
 * <p>기능이 켜져 있는데도 재발급이 <b>일어나지 않아야</b> 하는 경우다. 이것이 없으면
 * "매 요청 재발급" 하는 구현도 TC-OPS-020 을 통과해 버린다 - 서명 연산이 요청마다 붙고
 * 헤더가 늘 커지는데 검사로는 드러나지 않는다.
 */
@TestPropertySource(properties = {
		"app.jwt.expiration-minutes=120",
		"app.jwt.refresh-threshold-minutes=30" })
class JwtRefreshFarFromExpiryTest extends AbstractPgIntegrationTest {

	@SuppressWarnings("rawtypes")
	@Test
	void far_from_expiry_is_not_refreshed() {
		String token = signup("slide-far@b.com");
		ResponseEntity<Map> res = rest.exchange("/api/auth/me", HttpMethod.GET,
				new HttpEntity<>(bearer(token)), Map.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getHeaders().getFirst(JwtAuthenticationFilter.REFRESH_HEADER)).isNull();
	}
}
