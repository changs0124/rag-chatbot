package com.ragchatbot.service;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.ragchatbot.error.ApiExceptions.RateLimitException;

/**
 * 사용자별 분당 요청 상한(비용 통제, D-1). 고정 윈도우 방식.
 * <b>단일 인스턴스 전제</b>임 - 다중 인스턴스에서는 실효 한도가 곱해짐(R-6, 미결: 배포 형태 확정 시 중앙화).
 *
 * <p>지난 분(minute)의 창은 분이 바뀔 때 한 번에 버림. 로그인 키는 <b>미인증 요청 본문의 이메일</b>이라
 * 정리하지 않으면 서로 다른 주소를 계속 보내는 것만으로 맵이 무한히 커졌음(재리뷰 지적 4).
 *
 * <p><b>완화이지 해결이 아님</b> - 스윕은 분이 바뀔 때만 돌므로 <b>한 분 안에서는</b> 서로 다른 키가
 * 여전히 상한 없이 쌓임(실효 : 무한 → 분당 요청 수). 키 총량 상한·LRU 는 없으며, 그 결정은
 * 미결 「레이트리밋 카운터 회수」 행에 열려 있음.
 */
@Service
public class RateLimiterService {

	private final int chatPerMinute;
	private final int loginPerMinute;
	private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
	private final AtomicLong lastSweptMinute = new AtomicLong(-1);

	public RateLimiterService(@Value("${app.ratelimit.chat-per-minute:20}") int chatPerMinute,
			@Value("${app.ratelimit.login-per-minute:10}") int loginPerMinute) {
		this.chatPerMinute = chatPerMinute;
		this.loginPerMinute = loginPerMinute;
	}

	public void checkChat(UUID userId) {
		if (increment("chat:" + userId) > chatPerMinute) {
			throw new RateLimitException("요청이 너무 많음 - 잠시 후 다시 시도");
		}
	}

	/**
	 * 로그인 시도 상한 - <b>실패 누적만</b> 봄(성공한 로그인은 세지 않음). 정상 사용자가 여러 번
	 * 로그인해도 잠기지 않게 하려는 것임.
	 *
	 * <p>키가 정규화된 이메일이라 <b>대상 계정을 보호</b>하지만, 같은 이유로 <b>남의 계정을 잠글 지렛대</b>도 됨 -
	 * 알려진 주소로 일부러 틀리면 그 주인이 그 분 동안 429를 받음. 출발지(IP) 기준이 아니라 여러 계정을
	 * 훑는 살포형 시도도 걸리지 않음. 둘 다 배포 형태 확정 시 재검토 대상임(R-6).
	 */
	public void checkLoginAllowed(String email) {
		if (count("login:" + email) >= loginPerMinute) {
			throw new RateLimitException("로그인 시도가 너무 많음 - 잠시 후 다시 시도");
		}
	}

	public void recordLoginFailure(String email) {
		increment("login:" + email);
	}

	private int increment(String key) {
		long minute = currentMinute();
		sweep(minute);
		return windows.compute(key, (k, cur) -> {
			if (cur == null || cur.minute != minute) {
				return new Window(minute, 1);
			}
			cur.count++;
			return cur;
		}).count;
	}

	private int count(String key) {
		long minute = currentMinute();
		sweep(minute);
		Window w = windows.get(key);
		return w == null || w.minute != minute ? 0 : w.count;
	}

	private static long currentMinute() {
		return Instant.now().getEpochSecond() / 60;
	}

	/** 분이 바뀐 첫 호출 한 번만 지난 창을 버림 - 호출마다 훑지 않음 */
	private void sweep(long minute) {
		long prev = lastSweptMinute.get();
		if (prev != minute && lastSweptMinute.compareAndSet(prev, minute)) {
			windows.values().removeIf(w -> w.minute != minute);
		}
	}

	private static final class Window {
		final long minute;
		/**
		 * 증가는 {@code compute} 안(빈 락)에서만 일어나지만 <b>읽기는 락 밖</b>에서 함
		 * ({@link #count(String)}). 키가 이미 있으면 {@code compute} 가 같은 참조를 돌려주므로
		 * 맵에 새 참조가 게시되지 않아 happens-before 간선이 없음 - volatile 이 없으면 읽기 스레드가
		 * <b>낡은 값</b>을 볼 수 있음(재리뷰 라운드 2 N-1).
		 *
		 * <p><b>가시성만 해결함.</b> 읽기({@code checkLoginAllowed})와 쓰기({@code recordLoginFailure})가
		 * 별개 호출이라 원자 구간이 아니며, 동시 요청이 같은 값을 읽고 다 통과하면 한도를 넘김
		 * (초과폭은 동시 요청 수만큼). 구조적 해결은 중앙 저장소가 필요해 R-6 미결에 열려 있음.
		 */
		volatile int count;

		Window(long minute, int count) {
			this.minute = minute;
			this.count = count;
		}
	}
}
