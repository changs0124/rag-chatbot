package com.ragchatbot.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

	/** 본문을 문자열 그대로 보냄 - 깨진 JSON 은 객체로는 만들 수 없으므로 직렬화를 거치지 않음 */
	@SuppressWarnings("rawtypes")
	private org.springframework.http.ResponseEntity<Map> postRaw(String token, String path, String body) {
		HttpHeaders headers = bearer(token);
		headers.setContentType(MediaType.APPLICATION_JSON);
		return rest.exchange(path, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);
	}

	/**
	 * TC-OPS-014 : 문법이 깨진 JSON 본문은 400 이다.
	 *
	 * <p>읽을 수 없는 본문은 <b>서버 잘못이 아니라 요청 잘못</b>이다. 500 으로 내리면 상관 ID 만 남고
	 * 원인이 응답에서 사라져, 보내는 쪽은 무엇을 고쳐야 하는지 알 수 없다.
	 */
	@SuppressWarnings("unchecked")
	@Test
	void malformed_json_body_is_bad_request() {
		String token = createUser("boom-json@b.com");
		var res = postRaw(token, "/api/chat", "{\"conversationId\": BROKEN}");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(res.getBody()).containsKeys("code", "message");
		assertThat(res.getBody().get("code")).isEqualTo("BAD_REQUEST");
	}

	/**
	 * TC-OPS-015 : 인코딩이 어긋난 본문도 400 이다.
	 *
	 * <p>UTF-8 이 아닌 바이트가 섞이면 파서가 같은 예외를 던진다. 실제로 밟은 경로다 - 한글을
	 * CP949 로 보내는 클라이언트가 있으면 이렇게 된다. 문법 오류와 원인이 같으므로 함께 잠근다.
	 */
	@SuppressWarnings("unchecked")
	@Test
	void invalid_encoding_body_is_bad_request() {
		String token = createUser("boom-encoding@b.com");
		HttpHeaders headers = bearer(token);
		headers.setContentType(MediaType.APPLICATION_JSON);
		// 0xBF 는 UTF-8 에서 시작 바이트가 될 수 없음
		byte[] body = new byte[] { '{', '"', 'm', '"', ':', '"', (byte) 0xBF, '"', '}' };
		var res = rest.exchange("/api/chat", HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(res.getBody().get("code")).isEqualTo("BAD_REQUEST");
	}

	/**
	 * TC-OPS-016 : 본문이 아예 없어도 400 이다.
	 *
	 * <p>빈 본문은 파서가 읽을 것이 없다며 같은 예외를 던진다. 셋 다 "요청을 읽을 수 없음" 한 갈래라
	 * 한 핸들러가 받는다.
	 */
	@SuppressWarnings("unchecked")
	@Test
	void empty_body_is_bad_request() {
		String token = createUser("boom-empty@b.com");
		var res = postRaw(token, "/api/chat", "");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(res.getBody().get("code")).isEqualTo("BAD_REQUEST");
	}

	/**
	 * TC-OPS-017 : 경로 변수의 타입이 어긋나도 400 이다.
	 *
	 * <p>UUID 자리에 UUID 가 아닌 값이 오면 스프링이 변환에 실패한다. 이것도 보낸 쪽 잘못이므로
	 * 500 이 아니다. 없는 UUID(404)와 UUID 가 아닌 값(400)은 다른 사건이다.
	 */
	@SuppressWarnings("unchecked")
	@Test
	void path_variable_type_mismatch_is_bad_request() {
		String token = createUser("boom-pathvar@b.com");
		var res = get(token, "/api/conversations/not-a-uuid/messages");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(res.getBody().get("code")).isEqualTo("BAD_REQUEST");
	}

	/**
	 * TC-OPS-018 : 400 으로 내려도 내부 정보는 여전히 새지 않는다.
	 *
	 * <p>파서 예외 메시지에는 클래스 이름과 본문 조각이 들어 있다. 상태 코드를 고치면서
	 * 그것을 그대로 실어 보내면 TC-OPS-012 로 막아 둔 노출이 다른 문으로 되살아난다.
	 */
	@Test
	void bad_request_does_not_expose_internals() {
		String token = createUser("boom-json-leak@b.com");
		HttpHeaders headers = bearer(token);
		headers.setContentType(MediaType.APPLICATION_JSON);
		var res = rest.exchange("/api/chat", HttpMethod.POST,
				new HttpEntity<>("{\"conversationId\": BROKEN}", headers), String.class);

		assertThat(res.getBody()).doesNotContain("HttpMessageNotReadableException");
		assertThat(res.getBody()).doesNotContain("JsonParseException");
		assertThat(res.getBody()).doesNotContain("com.ragchatbot");
	}
}
