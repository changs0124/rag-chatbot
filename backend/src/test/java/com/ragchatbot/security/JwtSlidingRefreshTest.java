package com.ragchatbot.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

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

	@SuppressWarnings("rawtypes")
	private org.springframework.http.ResponseEntity<Map> me(String token) {
		return rest.exchange("/api/auth/me", HttpMethod.GET, new HttpEntity<>(bearer(token)), Map.class);
	}

	/** TC-OPS-020 : 만료가 가까우면 새 토큰이 헤더로 온다 */
	@Test
	void near_expiry_token_gets_refreshed() {
		String token = signup("slide-near@b.com");
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
		String token = signup("slide-usable@b.com");
		String refreshed = me(token).getHeaders().getFirst(JwtAuthenticationFilter.REFRESH_HEADER);

		var res = me(refreshed);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody().get("email")).isEqualTo("slide-usable@b.com");
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
