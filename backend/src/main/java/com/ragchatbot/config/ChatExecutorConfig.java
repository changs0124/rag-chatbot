package com.ragchatbot.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * SSE 스트리밍 작업용 실행기. 요청 스레드를 붙잡지 않고 비동기로 토큰을 흘림.
 */
@Configuration
public class ChatExecutorConfig {

	@Bean(destroyMethod = "shutdown")
	public ExecutorService chatExecutor() {
		return Executors.newFixedThreadPool(8);
	}
}
