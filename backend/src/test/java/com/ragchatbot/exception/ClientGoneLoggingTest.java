package com.ragchatbot.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 클라이언트가 끊은 연결은 「처리되지 않은 예외」 ERROR 가 아니다(#436).
 *
 * <p>실제 끊김은 타이밍을 맞춰 재현하기 어려워, 컨테이너가 넘기는 것과 같은 예외를 테스트 전용 컨트롤러가 던지게 한다.
 * 검증 대상은 받는 쪽(GlobalExceptionHandler)이 그 예외를 폴백까지 보내지 않는지다. 다른 예외가 여전히 ERROR 로
 * 남는 것은 {@code GlobalExceptionFallbackTest} · {@code ChatStreamExceptionHandlerTest} 가 지킨다.
 */
@ExtendWith(OutputCaptureExtension.class)
@ContextConfiguration(classes = ClientGoneLoggingTest.GoneConfig.class)
class ClientGoneLoggingTest extends AbstractPgIntegrationTest {

	@TestConfiguration
	static class GoneConfig {
		@Bean
		GoneController goneController() {
			return new GoneController();
		}
	}

	@RestController
	static class GoneController {
		@GetMapping("/api/test-client-gone")
		String gone() throws AsyncRequestNotUsableException {
			throw new AsyncRequestNotUsableException("Servlet container error notification for disconnected client",
					new IOException("Broken pipe"));
		}
	}

	@Test
	void client_disconnect_is_not_logged_as_unhandled_error(CapturedOutput output) {
		String token = createUser("client-gone@b.com");

		var res = rest.exchange("/api/test-client-gone", HttpMethod.GET, new HttpEntity<>(bearer(token)), String.class);

		// 전용 처리기가 받았다는 증거 - 폴백이었다면 500 INTERNAL_ERROR 본문이 나간다
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody()).isNull();
		assertThat(output).doesNotContain("처리되지 않은 예외");
		assertThat(output).doesNotContain("Broken pipe");
	}

	/**
	 * 실제 끊김은 비동기 디스패치에서, 이미 쓸 수 없는 응답으로 온다. 처리기는 응답을 받지도 않고 null(처리 완료 · 본문 없음)을
	 * 돌려준다 - 쓸 수 없는 응답에 쓰려다 다시 예외가 나는 일이 없다(실 경로는 배포 뒤 운영 끊기 재현으로 확인 - #436 리포트)
	 */
	@Test
	void handler_returns_no_body() {
		var request = new MockHttpServletRequest("POST", "/api/chat");

		var result = new GlobalExceptionHandler().handleClientGone(
				new AsyncRequestNotUsableException("disconnected", new IOException("Broken pipe")), request);

		assertThat(result).isNull();
	}
}
