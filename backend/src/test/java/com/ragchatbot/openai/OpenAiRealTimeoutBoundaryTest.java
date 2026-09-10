package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.ragchatbot.storage.FileStorage;

/**
 * 워커가 emitter 보다 오래 살 수 없게 하는 부등식 (#76 · #92).
 *
 * <p><b>왜 값이 아니라 부등식을 재는가</b> — 10분을 실제로 기다릴 수는 없고, 그럴 필요도 없다.
 * 문제는 「타임아웃이 언제 나는가」가 아니라 <b>두 타임아웃의 순서</b>였다. 종전에는 스트리밍
 * 읽기 타임아웃(하드코딩 10분)과 {@code app.chat.sse-timeout-ms}(기본 10분)가 <b>정확히 같은 값</b>이라,
 * emitter 가 죽은 뒤에도 워커가 읽기에 붙어 있는 창이 밀리초 경합으로 열렸다.
 *
 * <p>그동안 스레드와 동시 스트림 권한이 함께 잡혀, 화면에는 아무 스트림도 없는데
 * 「이미 응답을 받는 중」 429 를 받았다. {@code max-concurrent-per-user} 가 1 이라 한 사용자에게는
 * 그것이 곧 전면 차단이었다.
 */
class OpenAiRealTimeoutBoundaryTest {

	private static final String BASE_URL = "http://localhost:1";

	private static OpenAiRealService create(long streamReadMs, long sseMs) {
		return new OpenAiRealService("test-key", "gpt-4o", "", BASE_URL, streamReadMs, 30_000, sseMs, null);
	}

	/** 같은 값이면 막는다 - 이것이 실제로 있던 상태다(둘 다 10분) */
	@Test
	void equal_timeouts_fail_to_start() {
		assertThatThrownBy(() -> create(600_000, 600_000))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("stream-read-timeout-ms")
				.hasMessageContaining("sse-timeout-ms");
	}

	/** 읽기 쪽이 더 길면 더 나쁘다 - 워커가 확실히 더 오래 산다 */
	@Test
	void longer_read_timeout_fails_to_start() {
		assertThatThrownBy(() -> create(900_000, 600_000))
				.isInstanceOf(IllegalStateException.class);
	}

	/**
	 * 반대편 — 부등식이 성립하면 뜬다.
	 *
	 * <p>이 케이스가 없으면 「무조건 실패하는 구현」이 위 둘을 통과한다.
	 */
	@Test
	void shorter_read_timeout_starts() {
		assertThatCode(() -> create(540_000, 600_000)).doesNotThrowAnyException();
	}

	/**
	 * <b>실제 기본값</b>끼리도 성립해야 한다.
	 *
	 * <p>위 케이스들처럼 값을 손으로 넣으면 「내가 고른 두 수가 부등식을 만족한다」만 재게 된다.
	 * 여기서는 컨텍스트를 띄워 {@code @Value} 기본값이 실제로 꽂히게 두고, 그 조합이 기동하는지 본다.
	 * ({@code application.yml} 은 같은 값을 env 로 덮을 수 있게 한 번 더 적는데, 이 저장소가 다른
	 * 튜닝 값에도 쓰는 방식이다 — 두 자리가 갈리면 env 를 안 준 배포와 준 배포가 다르게 동작한다.)
	 * 한쪽 기본값만 바꾸면 <b>아무 설정도 주지 않은 배포가 곧바로 기동에 실패</b>하는데, 그 사고가
	 * 여기서 드러난다.
	 */
	@Test
	void real_defaults_satisfy_the_inequality() {
		new ApplicationContextRunner()
				.withBean(FileStorage.class, () -> mock(FileStorage.class))
				.withUserConfiguration(OpenAiRealService.class)
				// 이 빈은 @ConditionalOnProperty 로 live 에서만 로드된다
				.withPropertyValues("app.mode=live", "app.openai.api-key=test-key")
				.run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(OpenAiRealService.class));
	}
}
