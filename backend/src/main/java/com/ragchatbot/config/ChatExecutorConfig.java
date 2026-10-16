package com.ragchatbot.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * SSE 스트리밍 작업용 실행기. 요청 스레드를 붙잡지 않고 비동기로 토큰을 흘림.
 *
 * <p>풀 크기는 {@code ChatConcurrencyLimiter} 의 전역 상한과 <b>같은 프로퍼티</b>임 - 이유는 application.yml 의
 * {@code app.chat.max-concurrent-streams} 주석.
 */
@Configuration
public class ChatExecutorConfig {

	@Bean(destroyMethod = "shutdown")
	public ExecutorService chatExecutor(@Value("${app.chat.max-concurrent-streams}") int maxConcurrentStreams) {
		return Executors.newFixedThreadPool(maxConcurrentStreams);
	}
}
