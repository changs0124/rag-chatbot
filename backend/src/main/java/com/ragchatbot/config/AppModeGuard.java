package com.ragchatbot.config;

import java.util.Locale;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

/**
 * 실행 모드 가드. 생성자에서 예외를 던지면 ApplicationContext 기동이 실패함.
 *
 * <p>잠금 지점은 프로필이 아니라 <b>{@code app.mode} 필수화</b>임 - 값을 주지 않으면 어떤 환경에서도
 * 기동하지 못함. 이 빈은 프로필과 무관하게 항상 생성됨.
 *
 * <p>세 가지를 막음.
 * <ul>
 * <li>미설정 - 기본값 {@code mock}이 없어졌으므로 목업이 우연히 켜지는 경로가 없음</li>
 * <li>오타 - {@code mock}/{@code live} 밖의 값</li>
 * <li>운영 목업 - {@code prod} 프로필 + {@code mock}. 프로필은 {@code docker-compose.yml} 이 켠다(#305)</li>
 * </ul>
 */
@Configuration
public class AppModeGuard {

	private static final Set<String> MODES = Set.of("mock", "live");

	/**
	 * 모드 문자열을 읽는 <b>유일한 규칙</b>(#248) - 앞뒤 공백을 걷고 소문자로. {@code app.mode} 를 읽는 곳은
	 * 전부 이것을 거친다 - 한 곳이라도 원문을 비교하면 {@code APP_MODE=LIVE} 에서 그곳의 live 검사만 빠진다.
	 */
	public static String normalize(String appMode) {
		return appMode == null ? "" : appMode.trim().toLowerCase(Locale.ROOT);
	}

	public AppModeGuard(@Value("${app.mode}") String appMode, Environment environment) {
		String mode = normalize(appMode);
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
