package com.ragchatbot.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * AC-18 : 운영(prod) 프로필에서 APP_MODE=mock 이면 애플리케이션 기동을 실패시킴.
 * 목업 기본값(P-2)을 운영에서 끄는 것을 잊으면 가짜 응답이 나가는 결함(R-3)을 구조적으로 막음.
 * 생성자에서 예외를 던지면 ApplicationContext 기동이 실패함.
 */
@Configuration
@Profile("prod")
public class ProdModeGuard {

	public ProdModeGuard(@Value("${app.mode:mock}") String appMode) {
		if ("mock".equalsIgnoreCase(appMode)) {
			throw new IllegalStateException(
					"운영(prod) 프로필에서는 APP_MODE=mock 을 사용할 수 없음 (AC-18). "
							+ "실 연동으로 전환하려면 APP_MODE=live 로 설정할 것.");
		}
	}
}
