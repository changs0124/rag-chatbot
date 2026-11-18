package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** #713 : 첫 토큰 전 무음에 앞단 프록시가 연결을 끊지 않도록 주석 줄을 주기적으로 보낸다 */
class SseHeartbeatTest {

	private final SseHeartbeat heartbeat = new SseHeartbeat(Duration.ofMillis(30));

	@AfterEach
	void tearDown() {
		heartbeat.shutdown();
	}

	/** 보낸 이벤트를 SSE 본문 문자열로 모은다. failFirst 면 앞의 그만큼은 끊긴 연결처럼 던진다 */
	private static SseEmitter recording(List<String> sent, AtomicInteger failFirst) {
		return new SseEmitter() {
			@Override
			public void send(SseEventBuilder builder) throws IOException {
				if (failFirst.getAndDecrement() > 0) {
					throw new IOException("Broken pipe");
				}
				sent.add(builder.build().stream().map(d -> String.valueOf(d.getData())).collect(Collectors.joining()));
			}
		};
	}

	@Test
	void 주기적으로_SSE_주석_줄만_보낸다() throws Exception {
		List<String> sent = new CopyOnWriteArrayList<>();
		Runnable stop = heartbeat.start(recording(sent, new AtomicInteger()));
		Thread.sleep(200);
		stop.run();

		assertThat(sent).hasSizeGreaterThanOrEqualTo(3);
		// 「:」 로 시작하는 주석 블록 - data 줄이 없어 클라이언트가 이벤트로 다루지 않는다
		assertThat(sent).allMatch(s -> s.equals(":keepalive\n\n"));
	}

	@Test
	void 멈추면_더_보내지_않는다() throws Exception {
		List<String> sent = new CopyOnWriteArrayList<>();
		Runnable stop = heartbeat.start(recording(sent, new AtomicInteger()));
		Thread.sleep(100);
		stop.run();
		Thread.sleep(50); // 이미 돌던 한 번이 끝날 여유
		int after = sent.size();
		Thread.sleep(150);

		assertThat(sent).hasSize(after);
	}

	@Test
	void 전송이_실패해도_스케줄이_죽지_않고_예외가_새지_않는다() throws Exception {
		List<String> sent = new CopyOnWriteArrayList<>();
		// scheduleWithFixedDelay 는 작업이 던지면 이후 실행을 조용히 멈춘다 - 삼키지 않으면 첫 실패 뒤 하트비트가 사라진다
		Runnable stop = heartbeat.start(recording(sent, new AtomicInteger(2)));
		Thread.sleep(250);
		stop.run();

		assertThat(sent).isNotEmpty();
	}

	@Test
	void 운영_간격은_앞단_무음_한도보다_넉넉히_짧다() {
		// 운영 실측(#713) : 무음 122.6초는 살고 125초는 끊김
		assertThat(SseHeartbeat.INTERVAL).isLessThanOrEqualTo(Duration.ofSeconds(30));
	}
}
