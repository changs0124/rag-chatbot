package com.ragchatbot.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 예외 최종 폴백 (FEAT-OPS-002 · TC-OPS-010~013).
 *
 * <p>실 서비스에서 예상 못 한 예외를 일부러 나게 만들 수 없으므로, 테스트 전용 컨트롤러를 하나
 * 띄워 던지게 함. 검증 대상은 던지는 쪽이 아니라 <b>받는 쪽(GlobalExceptionHandler)</b> 임.
 */
@ContextConfiguration(classes = GlobalExceptionFallbackTest.BoomConfig.class)
class GlobalExceptionFallbackTest extends AbstractPgIntegrationTest {

	/** 내부 정보가 응답에 새는지 보려고 일부러 SQL 처럼 생긴 메시지를 담음 */
	static final String LEAKY_MESSAGE = "select * from users";

	@TestConfiguration
	static class BoomConfig {
		@Bean
		BoomController boomController() {
			return new BoomController();
		}
	}

	@RestController
	static class BoomController {
		@GetMapping("/api/test-boom")
		String boom() {
			throw new IllegalStateException(LEAKY_MESSAGE);
		}
	}

	@SuppressWarnings("rawtypes")
	private org.springframework.http.ResponseEntity<Map> get(String token, String path) {
		return rest.exchange(path, HttpMethod.GET, new HttpEntity<>(bearer(token)), Map.class);
	}

	/** TC-OPS-010 : 예상하지 못한 예외가 ApiError 형태로 나간다 */
	@SuppressWarnings("unchecked")
	@Test
	void unexpected_exception_returns_api_error_shape() {
		String token = createUser("boom-shape@b.com");
		var res = get(token, "/api/test-boom");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
		assertThat(res.getBody()).containsKeys("code", "message");
		assertThat(res.getBody().get("code")).isEqualTo("INTERNAL_ERROR");
	}

	/** TC-OPS-011 : 응답에 상관 ID가 실린다 - 이 번호로 서버 로그를 찾는다 */
	@SuppressWarnings("unchecked")
	@Test
	void response_carries_trace_id() {
		String token = createUser("boom-trace@b.com");
		var res = get(token, "/api/test-boom");

		String message = (String) res.getBody().get("message");
		assertThat(message).contains("오류 번호:");
		// 번호가 매 요청 달라야 로그에서 그 순간을 특정할 수 있음. 고정값이면 아무 소용이 없음
		String second = (String) get(token, "/api/test-boom").getBody().get("message");
		assertThat(second).isNotEqualTo(message);
	}

	/**
	 * TC-OPS-012 : 내부 예외 메시지가 응답에 노출되지 않는다.
	 *
	 * <p>본문 전체를 문자열로 훑음 - 특정 필드만 보면 나중에 필드가 하나 늘었을 때 그리로 새는 것을 못 잡음.
	 */
	@Test
	void internal_message_is_not_exposed() {
		String token = createUser("boom-leak@b.com");
		var res = rest.exchange("/api/test-boom", HttpMethod.GET, new HttpEntity<>(bearer(token)), String.class);

		assertThat(res.getBody()).doesNotContain(LEAKY_MESSAGE);
		assertThat(res.getBody()).doesNotContain("IllegalStateException");
	}

	/**
	 * TC-OPS-013 : 도메인 예외는 폴백에 걸리지 않는다.
	 *
	 * <p>폴백이 앞의 핸들러들을 가로채면 400·404 가 전부 500 이 된다. 폴백을 넣은 변경에서
	 * 가장 크게 망가질 수 있는 지점이라 함께 잠근다.
	 */
	@SuppressWarnings("unchecked")
	@Test
	void domain_exception_still_maps_to_its_own_status() {
		String token = createUser("boom-domain@b.com");
		// 없는 대화 - ConversationService 가 NotFoundException 을 던짐
		var res = get(token, "/api/conversations/11111111-1111-1111-1111-111111111111/messages");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(res.getBody().get("code")).isEqualTo("NOT_FOUND");
	}
}
