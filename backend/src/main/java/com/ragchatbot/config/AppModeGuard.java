package com.ragchatbot.config;

import java.util.Locale;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

/**
 * 실행 모드 가드(AC-18). 생성자에서 예외를 던지면 ApplicationContext 기동이 실패함.
 *
 * <p>2026-07-28 결정으로 {@code @Profile("prod")} 결합을 뗐음. 이전 구조는 <b>운영 프로필을 켤 때만</b>
 * 가드 빈이 생겼는데 저장소 어디에도 그 프로필을 켜는 경로가 없어, 배포 설정이 프로필을 빠뜨리면
 * 가드가 아예 생성되지 않는 빈 자물쇠였음(Phase 0 리뷰). 그래서 잠금 지점을 프로필이 아니라
 * <b>{@code app.mode} 필수화</b>로 옮김 - 값을 주지 않으면 어떤 환경에서도 기동하지 못함.
 *
 * <p>세 가지를 막음.
 * <ul>
 * <li>미설정 - 기본값 {@code mock}이 없어졌으므로 목업이 우연히 켜지는 경로가 없음</li>
 * <li>오타 - {@code mock}/{@code live} 밖의 값</li>
 * <li>운영 목업 - {@code prod} 프로필 + {@code mock}(기존 AC-18)</li>
 * </ul>
 */
@Configuration
public class AppModeGuard {

	private static final Set<String> MODES = Set.of("mock", "live");

	public AppModeGuard(@Value("${app.mode:}") String appMode, Environment environment) {
		String mode = appMode == null ? "" : appMode.trim().toLowerCase(Locale.ROOT);
		if (mode.isEmpty()) {
			throw new IllegalStateException(
					"APP_MODE 미설정 - 실행 모드를 명시해야 기동함 (AC-18). "
							+ "개발·테스트는 APP_MODE=mock, 실 연동은 APP_MODE=live 로 설정할 것.");
		}
		if (!MODES.contains(mode)) {
			throw new IllegalStateException(
					"APP_MODE 값이 올바르지 않음: '" + appMode + "' (AC-18). 허용값은 mock | live 임.");
		}
		if ("mock".equals(mode) && environment.acceptsProfiles(Profiles.of("prod"))) {
			throw new IllegalStateException(
					"운영(prod) 프로필에서는 APP_MODE=mock 을 사용할 수 없음 (AC-18). "
							+ "실 연동으로 전환하려면 APP_MODE=live 로 설정할 것.");
		}
	}
}
