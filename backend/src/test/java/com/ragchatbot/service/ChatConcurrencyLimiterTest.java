package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.ragchatbot.exception.ApiExceptions.RateLimitException;

/**
 * 동시 스트림 상한(back-pressure, 2026-07-28 결정). 스프링 없이 계수 규칙만 잼.
 */
class ChatConcurrencyLimiterTest {

	private static ChatConcurrencyLimiter limiter(int globalMax, int perUserMax) {
		return new ChatConcurrencyLimiter(globalMax, perUserMax);
	}

	@Test
	void same_user_second_stream_is_rejected() {
		var l = limiter(8, 1);
		UUID user = UUID.randomUUID();
		l.acquire(user);

		assertThatThrownBy(() -> l.acquire(user)).isInstanceOf(RateLimitException.class);
	}

	@Test
	void released_slot_is_reusable() {
		// 해제가 안 되면 그 사용자는 프로세스가 살아 있는 동안 영영 못 보냄
		var l = limiter(8, 1);
		UUID user = UUID.randomUUID();
		l.acquire(user);
		l.release(user);

		l.acquire(user); // 예외 없이 다시 잡혀야 함
		assertThat(l.activeCount()).isEqualTo(1);
	}

	@Test
	void global_cap_rejects_other_users_too() {
		// 레이트리밋(분당 횟수)으로는 막히지 않는 갈래 - 서로 다른 사용자가 한 번씩만 보내도 풀이 참
		var l = limiter(2, 1);
		l.acquire(UUID.randomUUID());
		l.acquire(UUID.randomUUID());

		assertThatThrownBy(() -> l.acquire(UUID.randomUUID())).isInstanceOf(RateLimitException.class);
	}

	@Test
	void counters_do_not_accumulate_keys() {
		// 미결 「레이트리밋 카운터 회수」와 같은 부채를 만들지 않으려고 계수 0이면 항목을 지움
		var l = limiter(8, 1);
		for (int i = 0; i < 50; i++) {
			UUID user = UUID.randomUUID();
			l.acquire(user);
			l.release(user);
		}

		assertThat(l.trackedUsers()).isZero();
		assertThat(l.activeCount()).isZero();
	}

	/** 거절된 요청은 자리를 잡지 않음 - 잡아 두면 거절이 스스로 다음 거절을 부름 */
	@Test
	void rejected_acquire_does_not_consume_a_slot() {
		var l = limiter(1, 1);
		UUID first = UUID.randomUUID();
		l.acquire(first);

		assertThatThrownBy(() -> l.acquire(UUID.randomUUID())).isInstanceOf(RateLimitException.class);
		assertThat(l.activeCount()).isEqualTo(1);

		l.release(first);
		assertThat(l.activeCount()).isZero();
	}
}
