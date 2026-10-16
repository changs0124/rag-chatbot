package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.ragchatbot.exception.ApiExceptions.RateLimitException;

/**
 * 카운터 키 총량 상한. 없으면 <b>한 분 안에서</b> 서로 다른 키가 상한 없이 쌓였음 -
 * 로그인 키가 미인증 요청 본문의 이메일이라 아무 문자열이나 새 키가 됐기 때문임.
 */
class RateLimiterKeyCapTest {

	private static RateLimiterService limiter(int maxKeys) {
		return new RateLimiterService(20, 10, 30, 5, maxKeys);
	}

	@Test
	void key_count_stays_within_cap() {
		var l = limiter(5);
		for (int i = 0; i < 500; i++) {
			l.acquireLoginAttempt("user" + i + "@b.com");
		}

		assertThat(l.trackedKeys()).isLessThanOrEqualTo(5);
	}

	/**
	 * <b>축출은 곧 카운터 리셋임</b> - 감수하고 택한 대가라 테스트로 못박아 둠. 이게 없으면 다음 사람이
	 * 이 동작을 결함으로 읽고 "고치다가" 메모리 상한을 도로 없앨 수 있음.
	 */
	@Test
	void evicted_key_loses_its_count() {
		var l = limiter(1);
		String victim = "victim@b.com";
		for (int i = 0; i < 10; i++) {
			l.acquireLoginAttempt(victim);
		}
		assertThatThrownBy(() -> l.acquireLoginAttempt(victim)).isInstanceOf(RateLimitException.class);

		l.acquireLoginAttempt("attacker@b.com"); // 상한 1 이라 victim 이 밀려남

		assertThatCode(() -> l.acquireLoginAttempt(victim)).doesNotThrowAnyException();
	}

	/**
	 * 로그인은 비밀번호를 보기 전에 한 칸을 선점한다(#359) - 확인과 계수가 따로면 병렬 요청이 같은 값을 읽는다.
	 * 성공해 돌려준 칸은 다시 쓸 수 있다.
	 */
	@Test
	void login_attempt_is_reserved_before_the_check_and_released_on_success() {
		var l = limiter(100);
		// 결과를 기록하지 않아도 칸이 찬다. 고정 윈도우라 상한(10)의 두 배 넘게 보내 분 경계를 넘어도 걸리게 한다
		int rejected = 0;
		for (int i = 0; i < 21; i++) {
			try {
				l.acquireLoginAttempt("r@b.com");
			} catch (RateLimitException e) {
				rejected++;
			}
		}
		assertThat(rejected).isPositive();

		var ok = limiter(100);
		for (int i = 0; i < 30; i++) {
			ok.acquireLoginAttempt("s@b.com");
			ok.releaseLoginAttempt("s@b.com"); // 성공
		}
		assertThatCode(() -> ok.acquireLoginAttempt("s@b.com")).doesNotThrowAnyException();
	}

	@Test
	void recently_used_key_survives_eviction() {
		// 접근 순서 기반이라 계속 쓰이는 키는 남아야 함 - 아니면 상한이 사실상 무작위 초기화가 됨
		var l = limiter(2);
		l.acquireLoginAttempt("kept@b.com");
		for (int i = 0; i < 20; i++) {
			l.acquireLoginAttempt("noise" + i + "@b.com");
			l.releaseLoginAttempt("kept@b.com"); // 계속 접근해 최근 사용으로 유지
		}

		assertThat(l.trackedKeys()).isLessThanOrEqualTo(2);
	}
}
