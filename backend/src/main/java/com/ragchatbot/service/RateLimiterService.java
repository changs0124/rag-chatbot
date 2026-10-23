package com.ragchatbot.service;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.ragchatbot.exception.ApiExceptions.RateLimitException;

/**
 * 사용자별 분당 요청 상한(비용 통제, REQ-OPS-003). 고정 윈도우 방식.
 * <b>단일 인스턴스 전제</b>임 - 다중 인스턴스에서는 실효 한도가 곱해짐.
 *
 * <p>지난 분(minute)의 창은 분이 바뀔 때 한 번에 버림. 로그인 키는 <b>미인증 요청 본문의 이메일</b>이라
 * 정리하지 않으면 서로 다른 주소를 계속 보내는 것만으로 맵이 무한히 커짐.
 *
 * <p><b>키 총량 상한 + LRU 축출</b>({@code app.ratelimit.max-keys}) - 스윕만으로는 <b>한 분 안에서</b>
 * 쌓이는 키를 막지 못하므로, 상한을 넘으면 가장 오래 안 쓴 키부터 밀어내 메모리를 유계로 둠.
 *
 * <p><b>대신 축출은 곧 카운터 리셋임</b> - 서로 다른 이메일을 상한 이상 쏟아부으면 남의 로그인 실패
 * 카운터를 밀어낼 수 있음. 로그인 상한은 대입 <b>지연</b> 장치이지 차단 장치가 아니므로 감수한 것이며,
 * 이 약화는 {@code docs/02_architecture/overview.md} 「알려진 제약」에 적혀 있음.
 *
 * <p>맵 접근을 전부 {@code synchronized} 로 감쌈 - LRU 축출은 원자 구간이 필요하고 락 밖 읽기 가시성도
 * 이것으로 지킴. 확인과 계수는 한 메서드({@link #increment}) 안에서 함께 해야 경합이 없다 - 따로 부르면
 * 사이가 비어 병렬 요청이 같은 값을 읽는다(로그인이 그래서 선점 방식이다, #359).
 */
@Service
public class RateLimiterService {

	private final int chatPerMinute;
	private final int loginPerMinute;
	private final int uploadPerMinute;
	private final int passwordChangePerMinute;
	private final Map<String, Window> windows;
	private final Clock clock;
	private long lastSweptMinute = -1;

	@Autowired
	public RateLimiterService(@Value("${app.ratelimit.chat-per-minute}") int chatPerMinute,
			@Value("${app.ratelimit.login-per-minute}") int loginPerMinute,
			@Value("${app.ratelimit.upload-per-minute}") int uploadPerMinute,
			@Value("${app.ratelimit.password-change-per-minute}") int passwordChangePerMinute,
			@Value("${app.ratelimit.max-keys}") int maxKeys) {
		this(chatPerMinute, loginPerMinute, uploadPerMinute, passwordChangePerMinute, maxKeys, Clock.systemUTC());
	}

	/** 테스트용 - 분 경계를 결정적으로 넘기려고 시계를 주입함 */
	RateLimiterService(int chatPerMinute, int loginPerMinute, int uploadPerMinute, int passwordChangePerMinute,
			int maxKeys, Clock clock) {
		this.clock = clock;
		this.chatPerMinute = chatPerMinute;
		this.loginPerMinute = loginPerMinute;
		this.uploadPerMinute = uploadPerMinute;
		this.passwordChangePerMinute = passwordChangePerMinute;
		this.windows = new LinkedHashMap<>(16, 0.75f, true) {
			@Override
			protected boolean removeEldestEntry(Map.Entry<String, Window> eldest) {
				return size() > maxKeys;
			}
		};
	}

	public void checkChat(UUID userId) {
		if (increment("chat:" + userId) > chatPerMinute) {
			throw new RateLimitException("요청이 너무 많음 - 잠시 후 다시 시도");
		}
	}

	/**
	 * 첨부 업로드 상한(#95).
	 *
	 * <p>{@code MultipartFile.getBytes()} 가 파일 전체를 힙에 올리므로, 26MB 요청을 병렬로 퍼부으면
	 * Tomcat 기본 200 스레드 × 26MB ≈ 5GB 로 <b>단일 인스턴스가 OOM</b> 된다. 고아 회수는 매시 정각이고
	 * 최소 유예 10분이라 그 사이 쌓인 파일이 {@code uploads} 볼륨을 채우는데, compose 에서
	 * {@code uploads} 와 {@code pgdata} 가 같은 호스트 파일시스템이라 <b>디스크가 차면 Postgres 가
	 * 먼저 멎는다.</b>
	 *
	 * <p>채팅보다 높게 잡음 - 한 메시지에 이미지를 여러 장 붙이는 것이 정상 사용이기 때문임.
	 * <b>힙 적재 자체는 이 축으로 사라지지 않음</b>(스트리밍 저장은 원인이 다른 별건임) - 병렬도를
	 * 유계로 두어 규모를 줄이는 것이 여기서 하는 일임.
	 */
	public void checkUpload(UUID userId) {
		if (increment("upload:" + userId) > uploadPerMinute) {
			throw new RateLimitException("업로드가 너무 많음 - 잠시 후 다시 시도");
		}
	}

	/**
	 * 비밀번호 변경 상한(#95). 매 호출이 BCrypt 를 <b>두 번</b> 돈다 - 현재 비밀번호 검증과 새 해시 생성.
	 *
	 * <p>현재 비밀번호를 일부러 틀려도 {@code matches} 는 돈다. 코스트 10 에서 한 번이 ~100ms 라
	 * 수십 병렬이면 CPU 가 채워져 채팅·로그인이 함께 느려진다. 비밀번호를 알아내지는 못하므로
	 * 가용성 저하뿐이지만, 정상 사용은 <b>가끔 한 번</b>이라 낮게 잡아도 막히지 않는다.
	 */
	public void checkPasswordChange(UUID userId) {
		if (increment("pwchange:" + userId) > passwordChangePerMinute) {
			throw new RateLimitException("비밀번호 변경 시도가 너무 많음 - 잠시 후 다시 시도");
		}
	}

	/**
	 * 로그인 시도 상한 - <b>실패 누적만</b> 봄(성공한 로그인은 세지 않음). 정상 사용자가 여러 번
	 * 로그인해도 잠기지 않게 하려는 것임.
	 *
	 * <p><b>비밀번호를 보기 전에 한 칸을 선점하고, 성공하면 {@link #releaseLoginAttempt} 로 돌려준다(#359).</b>
	 * 확인만 하고 실패 뒤에 세면, BCrypt(~100ms)가 도는 사이 병렬 요청이 모두 같은 카운터를 읽어
	 * 실효 상한이 분당 10이 아니라 톰캣 스레드 수(200)가 됐다.
	 *
	 * <p>키가 정규화된 이메일이라 <b>대상 계정을 보호</b>하지만, 같은 이유로 <b>남의 계정을 잠글 지렛대</b>도 됨 -
	 * 알려진 주소로 일부러 틀리면 그 주인이 그 분 동안 429를 받음. 출발지(IP) 기준이 아니라 여러 계정을
	 * 훑는 살포형 시도도 걸리지 않음. 둘 다 단일 인스턴스 전제에서 감수한 한계임.
	 *
	 * @return 선점한 창(분) - {@link #releaseLoginAttempt} 에 그대로 넘긴다
	 */
	public synchronized long acquireLoginAttempt(String email) {
		long minute = currentMinute(); // 계수한 창과 돌려줄 창이 같도록 한 락 안에서 한 번만 읽음
		if (incrementAt("login:" + email, minute) > loginPerMinute) {
			throw new RateLimitException("로그인 시도가 너무 많음 - 잠시 후 다시 시도");
		}
		return minute;
	}

	/**
	 * 성공한 로그인의 선점분을 돌려줌. <b>선점한 창에만</b> 돌려준다(#365) - 분이 바뀌어 창이 새로 열렸으면
	 * 돌려줄 것이 없다. 지금 분으로 판단하면 59.9초에 선점하고 다음 분에 돌려줄 때 새 창에 쌓인 남의 실패를 지웠다.
	 */
	public void releaseLoginAttempt(String email, long acquiredMinute) {
		decrement("login:" + email, acquiredMinute);
	}

	private synchronized int increment(String key) {
		return incrementAt(key, currentMinute());
	}

	/** 락 안에서만 부른다 */
	private int incrementAt(String key, long minute) {
		sweep(minute);
		Window cur = windows.get(key);
		if (cur == null || cur.minute != minute) {
			cur = new Window(minute, 0);
			windows.put(key, cur);
		}
		return ++cur.count;
	}

	private synchronized void decrement(String key, long minute) {
		Window w = windows.get(key);
		if (w != null && w.minute == minute && w.count > 0) {
			w.count--;
		}
	}

	/** 테스트용 - 지금 추적 중인 키 수 */
	synchronized int trackedKeys() {
		return windows.size();
	}

	private long currentMinute() {
		return clock.instant().getEpochSecond() / 60;
	}

	/** 분이 바뀐 첫 호출 한 번만 지난 창을 버림 - 호출마다 훑지 않음 */
	private void sweep(long minute) {
		if (lastSweptMinute != minute) {
			lastSweptMinute = minute;
			windows.values().removeIf(w -> w.minute != minute);
		}
	}

	/** 맵 접근이 전부 {@code synchronized} 안이라 {@code volatile} 이 필요 없음 */
	private static final class Window {
		final long minute;
		int count;

		Window(long minute, int count) {
			this.minute = minute;
			this.count = count;
		}
	}
}
