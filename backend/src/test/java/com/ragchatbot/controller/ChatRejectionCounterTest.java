package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 동시성 거절이 <b>레이트리밋 카운터를 태우지 않는지</b> (#96).
 *
 * <p>레이트리밋은 <b>비용 통제</b>가 목적이다({@code application.yml} 의 「사용자별 분당 채팅 상한
 * (비용 통제)」). 동시성 상한에 걸려 되돌아간 요청은 <b>모델을 부르지 않아 비용이 0</b>이다.
 * 그것을 비용 카운터에 세면 유량 제어가 스스로를 무력화한다 — 스트림이 도는 중에 전송을 연타하면
 * 전부 「이미 응답 중」 429 인데 분당 한도가 소진되어, <b>스트림이 끝난 뒤에도 그 분이 끝날 때까지</b>
 * 새 질문이 막혔다.
 *
 * <p><b>어떻게 재는가</b> — 두 429 는 상태 코드가 같아 구분되지 않지만 <b>메시지가 다르다.</b>
 * 분당 상한을 1 로, 동시 상한을 0 으로 두면 모든 요청이 동시성에 걸려야 하고, 카운터가 타면
 * 두 번째부터 레이트리밋 메시지로 바뀐다. 타이밍에 기대지 않는 결정적 관측이다.
 *
 * <p><b>별도 파일인 이유</b> : 두 상한이 클래스 단위 프로퍼티라 한 클래스에 담을 수 없다
 * ({@code JwtRefreshDisabledTest} 와 같은 이유).
 */
@TestPropertySource(properties = {
		"app.ratelimit.chat-per-minute=1",
		"app.chat.max-concurrent-per-user=0" })
class ChatRejectionCounterTest extends AbstractPgIntegrationTest {

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private String createConversation(String token) {
		var res = rest.exchange("/api/conversations", HttpMethod.POST,
				new HttpEntity<>(Map.of("title", "대화"), bearer(token)), Map.class);
		return (String) res.getBody().get("id");
	}

	@SuppressWarnings("rawtypes")
	private ResponseBodyAndStatus chat(String token, String convId) {
		var res = rest.exchange("/api/chat", HttpMethod.POST,
				new HttpEntity<>(Map.of("conversationId", convId, "message", "안녕"), bearer(token)), Map.class);
		Object message = res.getBody() == null ? null : res.getBody().get("message");
		return new ResponseBodyAndStatus(res.getStatusCode(), message == null ? "" : message.toString());
	}

	private record ResponseBodyAndStatus(org.springframework.http.HttpStatusCode status, String message) {
	}

	/**
	 * 분당 상한이 1 인데 동시성 거절을 세 번 받아도 <b>셋 다 동시성 메시지</b>여야 한다.
	 *
	 * <p>카운터가 타면 두 번째부터 「요청이 너무 많음」으로 바뀐다 — 모델은 한 번도 불리지 않았는데
	 * 비용 한도가 소진된 것이다.
	 */
	@Test
	void concurrency_rejection_does_not_consume_the_per_minute_budget() {
		String token = createUser("reject-counter@b.com");
		String convId = createConversation(token);

		for (int i = 1; i <= 3; i++) {
			var res = chat(token, convId);
			assertThat(res.status()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
			assertThat(res.message())
					.withFailMessage("%d번째 요청이 레이트리밋으로 거절됨 - 동시성 거절이 분당 카운터를 태웠다는 뜻. "
							+ "실제 메시지: %s", i, res.message())
					.contains("이미 응답을 받는 중");
		}
	}
}
