package com.ragchatbot.service;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.ragchatbot.error.ApiExceptions.RateLimitException;

/**
 * 사용자별 분당 요청 상한(비용 통제, D-1). 고정 윈도우 방식.
 * <b>단일 인스턴스 전제</b>임 - 다중 인스턴스에서는 실효 한도가 곱해짐(R-6, 미결: 배포 형태 확정 시 중앙화).
 */
@Service
public class RateLimiterService {

	private final int chatPerMinute;
	private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

	public RateLimiterService(@Value("${app.ratelimit.chat-per-minute:20}") int chatPerMinute) {
		this.chatPerMinute = chatPerMinute;
	}

	public void checkChat(UUID userId) {
		check("chat:" + userId, chatPerMinute);
	}

	private void check(String key, int limit) {
		long minute = Instant.now().getEpochSecond() / 60;
		Window w = windows.compute(key, (k, cur) -> {
			if (cur == null || cur.minute != minute) {
				return new Window(minute, 1);
			}
			cur.count++;
			return cur;
		});
		if (w.count > limit) {
			throw new RateLimitException("요청이 너무 많음 - 잠시 후 다시 시도");
		}
	}

	private static final class Window {
		final long minute;
		int count;

		Window(long minute, int count) {
			this.minute = minute;
			this.count = count;
		}
	}
}
