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
 * 슬라이딩 재발급을 끈 경우 (FEAT-OPS-003 · TC-OPS-021 · TC-OPS-023).
 *
 * <p><b>별도 파일인 이유</b> : 임계값이 클래스 단위 프로퍼티라 한 클래스에 담을 수 없고,
 * 중첩 static 클래스로 두면 surefire 기본 include 패턴(`**&#47;*Test.java`)에 걸리지 않아
 * <b>조용히 실행되지 않는다</b>. 실제로 그렇게 한 번 초록불이 났다.
 */
@TestPropertySource(properties = {
		// 만료는 멀고(120분) 임계도 0 - 두 경우 모두 재발급이 없어야 함
		"app.jwt.expiration-minutes=120",
		"app.jwt.refresh-threshold-minutes=0" })
class JwtRefreshDisabledTest extends AbstractPgIntegrationTest {

	/** TC-OPS-023 : 임계가 0이면 재발급하지 않는다 - 되돌리기 경로가 실제로 동작하는지 */
	@SuppressWarnings("rawtypes")
	@Test
	void zero_threshold_disables_refresh() {
		String token = createUser("slide-off@b.com");
		ResponseEntity<Map> res = rest.exchange("/api/auth/me", HttpMethod.GET,
				new HttpEntity<>(bearer(token)), Map.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getHeaders().getFirst(JwtAuthenticationFilter.REFRESH_HEADER)).isNull();
	}
}
