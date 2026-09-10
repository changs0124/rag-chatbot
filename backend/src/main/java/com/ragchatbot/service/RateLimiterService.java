package com.ragchatbot.service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.ragchatbot.exception.ApiExceptions.RateLimitException;

/**
 * 사용자별 분당 요청 상한(비용 통제, D-1). 고정 윈도우 방식.
 * <b>단일 인스턴스 전제</b>임 - 다중 인스턴스에서는 실효 한도가 곱해짐(R-6, 미결: 배포 형태 확정 시 중앙화).
 *
 * <p>지난 분(minute)의 창은 분이 바뀔 때 한 번에 버림. 로그인 키는 <b>미인증 요청 본문의 이메일</b>이라
 * 정리하지 않으면 서로 다른 주소를 계속 보내는 것만으로 맵이 무한히 커졌음(재리뷰 지적 4).
 *
 * <p><b>키 총량 상한 + LRU 축출</b>(2026-07-28 결정, {@code app.ratelimit.max-keys}). 스윕만으로는
 * <b>한 분 안에서</b> 서로 다른 키가 상한 없이 쌓였음 - 이제 상한을 넘으면 가장 오래 안 쓴 키부터 밀려나
 * 메모리가 유계임.
 *
 * <p><b>대신 축출은 곧 카운터 리셋임</b> - 서로 다른 이메일을 상한 이상 쏟아부으면 남의 로그인 실패
 * 카운터를 밀어낼 수 있음. 로그인 상한은 대입 <b>지연</b> 장치이지 차단 장치가 아니므로 감수한 것이며,
 * 이 약화는 {@code docs/02_architecture/overview.md} 「알려진 제약」에 적혀 있음.
 *
 * <p>맵 접근을 전부 {@code synchronized} 로 감쌈 - LRU 축출은 원자 구간이 필요하고, 종전 구조의
 * <b>락 밖 읽기 가시성</b> 문제와 <b>check-then-act 경합</b>도 함께 사라짐.
 */
@Service
public class RateLimiterService {

	private final int chatPerMinute;
	private final int loginPerMinute;
	private final int uploadPerMinute;
	private final int passwordChangePerMinute;
	private final Map<String, Window> windows;
	private long lastSweptMinute = -1;

	public RateLimiterService(@Value("${app.ratelimit.chat-per-minute:20}") int chatPerMinute,
			@Value("${app.ratelimit.login-per-minute:10}") int loginPerMinute,
			@Value("${app.ratelimit.upload-per-minute:30}") int uploadPerMinute,
			@Value("${app.ratelimit.password-change-per-minute:5}") int passwordChangePerMinute,
			@Value("${app.ratelimit.max-keys:10000}") int maxKeys) {
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
	 * 첨부 업로드 상한(#95). 종전에는 어느 축에도 걸리지 않았음.
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

	private synchronized int increment(String key) {
		long minute = currentMinute();
		sweep(minute);
		Window cur = windows.get(key);
		if (cur == null || cur.minute != minute) {
			cur = new Window(minute, 0);
			windows.put(key, cur);
		}
		return ++cur.count;
	}

	private synchronized int count(String key) {
		long minute = currentMinute();
		sweep(minute);
		Window w = windows.get(key);
		return w == null || w.minute != minute ? 0 : w.count;
	}

	/** 테스트·운영 점검용 - 지금 추적 중인 키 수 */
	synchronized int trackedKeys() {
		return windows.size();
	}

	private static long currentMinute() {
		return Instant.now().getEpochSecond() / 60;
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
