package com.ragchatbot.service;

import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.annotation.PreDestroy;

/**
 * 채팅 SSE 에 주기적으로 주석 줄({@code :keepalive})을 흘려 무음 구간에 연결이 잘리지 않게 한다(#713).
 *
 * <p>모델이 검색 결과를 읽고 첫 토큰을 내기까지 서버는 한 바이트도 쓰지 않는다. 그 무음이 약 2분을 넘으면 앞단
 * 프록시(Cloudflare)가 연결을 끊었다 - 운영 실측 : 무음 122.6초는 살고 125초는 끊김. 간격은 그 1/6 쯤이다.
 *
 * <p>주석 줄은 SSE 규격상 클라이언트가 버린다(프론트 파서는 data 줄 없는 블록을 무시). 전송 실패는 삼킨다 - 끊김
 * 판정과 저장 · 질문 철회는 지금처럼 스트림 스레드의 다음 쓰기가 맡는다(#489)
 */
@Component
public class SseHeartbeat {

	static final Duration INTERVAL = Duration.ofSeconds(20);

	private final ScheduledExecutorService scheduler;
	private final Duration interval;

	public SseHeartbeat() {
		this(INTERVAL);
	}

	SseHeartbeat(Duration interval) {
		this.interval = interval;
		this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
			Thread t = new Thread(r, "sse-heartbeat");
			t.setDaemon(true);
			return t;
		});
	}

	/** 하트비트를 시작한다. 스트림이 끝나면 돌려준 핸들로 멈춘다 */
	public Runnable start(SseEmitter emitter) {
		ScheduledFuture<?> task = scheduler.scheduleWithFixedDelay(() -> {
			try {
				emitter.send(SseEmitter.event().comment("keepalive"));
			} catch (Exception ignored) {
				// 끊겼거나 이미 닫힘 - 스트림 스레드가 다음 쓰기에서 알아서 처리한다
			}
		}, interval.toMillis(), interval.toMillis(), TimeUnit.MILLISECONDS);
		return () -> task.cancel(false);
	}

	@PreDestroy
	void shutdown() {
		scheduler.shutdownNow();
	}
}
