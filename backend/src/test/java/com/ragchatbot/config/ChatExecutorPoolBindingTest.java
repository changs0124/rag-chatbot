package com.ragchatbot.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.ragchatbot.exception.ApiExceptions.RateLimitException;
import com.ragchatbot.service.ChatConcurrencyLimiter;

/**
 * 실행기 풀 크기와 동시 스트림 전역 상한이 <b>같은 값에 묶여 있는지</b> (#76).
 *
 * <p>{@code ChatExecutorConfig} 의 주석이 이 결합을 계약으로 선언한다 — 「상한이 풀보다 크면 초과분이
 * 큐에 쌓여 응답 한 바이트 없이 SSE 타임아웃까지 기다린다(2026-07-28 CI 에서 실제로 600초 행으로
 * 드러남)」. 그런데 <b>그 계약을 지키는 것은 두 클래스가 같은 프로퍼티 문자열을 쓴다는 사실뿐</b>이었고,
 * 어느 한쪽의 키나 기본값이 바뀌어도 빨간불이 되는 케이스가 없었다.
 *
 * <p>큐에 쌓인 요청은 <b>종료가 관측되지 않는다</b> — 429 도 오류도 없이 그냥 응답이 없다.
 * 같은 지점에서 터지는 다른 결함들(#84 · #85)과 증상이 겹쳐 원인을 가리기 어렵다.
 *
 * <p>기본값이 아니라 <b>특이한 값</b>(3)을 주어, 양쪽이 우연히 같은 상수를 들고 있는 경우까지 가른다.
 */
class ChatExecutorPoolBindingTest {

	private static final int LIMIT = 3;

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(ChatExecutorConfig.class)
			.withBean(ChatConcurrencyLimiter.class, () -> new ChatConcurrencyLimiter(LIMIT, LIMIT))
			.withPropertyValues(
					"app.chat.max-concurrent-streams=" + LIMIT,
					"app.chat.max-concurrent-per-user=" + LIMIT);

	/** 풀 크기가 상한 프로퍼티를 따라간다 */
	@Test
	void pool_size_follows_the_concurrency_property() {
		runner.run(ctx -> {
			ExecutorService executor = ctx.getBean(ExecutorService.class);
			assertThat(executor).isInstanceOf(ThreadPoolExecutor.class);
			assertThat(((ThreadPoolExecutor) executor).getMaximumPoolSize())
					.withFailMessage("풀 크기가 상한과 갈리면 초과분이 큐에 쌓여 응답 없이 SSE 타임아웃까지 기다린다")
					.isEqualTo(LIMIT);
		});
	}

	/**
	 * 반대편 — 상한 쪽도 같은 값에서 거절한다.
	 *
	 * <p>풀 크기만 재면 「상한이 풀보다 큰」 방향을 못 잡는다. 상한이 실제로 몇에서 걷어차는지를
	 * 함께 봐야 둘이 같은 수라는 것이 잠긴다.
	 */
	@Test
	void limiter_rejects_at_the_same_number() {
		ChatConcurrencyLimiter limiter = new ChatConcurrencyLimiter(LIMIT, LIMIT);
		for (int i = 0; i < LIMIT; i++) {
			limiter.acquire(UUID.randomUUID());
		}
		assertThatThrownBy(() -> limiter.acquire(UUID.randomUUID()))
				.isInstanceOf(RateLimitException.class);
	}
}
