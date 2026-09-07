package com.ragchatbot.service;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.ragchatbot.exception.ApiExceptions.RateLimitException;

/**
 * 동시 스트림 상한(back-pressure). 레이트리밋이 <b>분당 횟수</b>를 재는 것과 달리 여기서는
 * <b>지금 열려 있는 스트림 수</b>를 잼 - 서로 다른 사용자가 한 번씩만 보내도 풀은 포화되므로
 * 횟수 상한만으로는 막히지 않음(2026-07-28 결정).
 *
 * <p><b>거절은 {@code prepare} 앞에서 해야 함.</b> {@code prepare} 가 사용자 메시지를 이미 저장하므로,
 * 뒤에서 거절하면 답변 없는 사용자 메시지가 대화에 남음.
 *
 * <p>전역 상한은 {@code chatExecutor} 풀 크기와 <b>같은 프로퍼티를 씀</b>({@code ChatExecutorConfig}).
 * 둘이 갈리면 상한이 풀보다 커져 큐가 다시 쌓이므로 값의 정본을 하나로 둔 것임.
 *
 * <p>맵 전체를 {@code synchronized} 로 감쌈 - 규모가 단일 인스턴스라 경합이 없고, 레이트리밋에서
 * 겪은 <b>락 밖 읽기의 가시성 문제와 check-then-act 경합</b>을 구조적으로 만들지 않으려는 것임.
 * 계수가 0이 되면 항목을 지우므로 <b>키가 누적되지 않음</b>(미결 「레이트리밋 카운터 회수」와 다름).
 *
 * <p><b>단일 인스턴스 전제</b>임 - 인스턴스가 늘면 상한이 인스턴스별로 갈려 실효 한도가 곱해짐(R-6, 미결).
 */
@Service
public class ChatConcurrencyLimiter {

	private final int globalMax;
	private final int perUserMax;
	private final Map<UUID, Integer> perUser = new HashMap<>();
	private int active;

	public ChatConcurrencyLimiter(
			@Value("${app.chat.max-concurrent-streams:8}") int globalMax,
			@Value("${app.chat.max-concurrent-per-user:1}") int perUserMax) {
		this.globalMax = globalMax;
		this.perUserMax = perUserMax;
	}

	/** 자리를 잡음. 못 잡으면 429 - 큐에 쌓아 두고 기다리게 하지 않음(무응답이 곧 결함이었음) */
	public synchronized void acquire(UUID userId) {
		if (perUser.getOrDefault(userId, 0) >= perUserMax) {
			throw new RateLimitException("이미 응답을 받는 중임 - 끝난 뒤 다시 시도");
		}
		if (active >= globalMax) {
			throw new RateLimitException("동시 요청이 많음 - 잠시 후 다시 시도");
		}
		active++;
		perUser.merge(userId, 1, Integer::sum);
	}

	/** 반드시 {@code finally} 에서 부를 것 - 빠뜨리면 그 자리는 프로세스가 살아 있는 동안 영구 점유됨 */
	public synchronized void release(UUID userId) {
		if (active > 0) {
			active--;
		}
		perUser.computeIfPresent(userId, (k, v) -> v <= 1 ? null : v - 1);
	}

	synchronized int activeCount() {
		return active;
	}

	synchronized int trackedUsers() {
		return perUser.size();
	}
}
