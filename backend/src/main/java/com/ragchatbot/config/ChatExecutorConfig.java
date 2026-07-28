package com.ragchatbot.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * SSE 스트리밍 작업용 실행기. 요청 스레드를 붙잡지 않고 비동기로 토큰을 흘림.
 *
 * <p>풀 크기는 {@code ChatConcurrencyLimiter} 의 전역 상한과 <b>같은 프로퍼티</b>임. 상한이 풀보다
 * 크면 초과분이 큐에 쌓여 응답 한 바이트 없이 SSE 타임아웃까지 기다리게 되므로(2026-07-28 CI 에서
 * 실제로 600초 행으로 드러남) 두 값을 갈라 둘 자리를 만들지 않음.
 */
@Configuration
public class ChatExecutorConfig {

	@Bean(destroyMethod = "shutdown")
	public ExecutorService chatExecutor(@Value("${app.chat.max-concurrent-streams:8}") int maxConcurrentStreams) {
		return Executors.newFixedThreadPool(maxConcurrentStreams);
	}
}
