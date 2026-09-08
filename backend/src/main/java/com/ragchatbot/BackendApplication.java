package com.ragchatbot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 스케줄링은 고아 첨부 회수(OrphanCleanupScheduler) 때문에 켜 둠.
 *
 * <p>{@code UserDetailsServiceAutoConfiguration} 은 제외함 - 인증은 JWT 필터가 전담하고
 * {@code UserDetailsService} 를 어디서도 쓰지 않는데, 그냥 두면 부팅 때마다 쓰이지 않는
 * 인메모리 사용자를 만들고 <b>운영 로그에 "Using generated security password"</b> 를 남김.
 * 로그인 수단(httpBasic · formLogin)이 꺼져 있어 악용 경로는 없지만, 운영 로그에 남을 문구가 아님.
 */
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@EnableScheduling
public class BackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(BackendApplication.class, args);
	}

}
