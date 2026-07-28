package com.ragchatbot.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * AC-18 : 실행 모드가 명시되지 않으면 기동 실패 · prod 프로필에서 mock 이면 기동 실패.
 *
 * <p>생성자 단위 검증만 두면 프로퍼티 바인딩과 프로필 결합이 검사되지 않아, 프로퍼티 키를 바꾸거나
 * 프로필 이름을 오타 내도 초록이 됨(2026-07-28 Phase 0 리뷰 M-1). 그래서 실제 컨텍스트를 띄워 고정함.
 *
 * <p>이전 이름은 {@code ProdModeGuardTest} 였음 - 가드가 prod 전용이 아니게 되면서 함께 개명함.
 */
class AppModeGuardTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(AppModeGuard.class);

	/**
	 * 새 계약의 핵심 - 프로필과 무관하게 <b>모드를 안 주면 못 뜬다</b>.
	 * 이전 구조에서는 기본값 mock 이 조용히 적용돼 운영에서도 목업이 나갈 수 있었음.
	 */
	@Test
	void without_app_mode_fails_to_start() {
		runner.run(ctx -> assertThat(ctx).hasFailed());
	}

	@Test
	void unknown_app_mode_fails_to_start() {
		runner.withPropertyValues("app.mode=fake")
				.run(ctx -> assertThat(ctx).hasFailed());
	}

	/** 개발 기본 경로 - 모드를 명시하면 프로필 없이도 정상 기동함 */
	@Test
	void explicit_mock_starts() {
		runner.withPropertyValues("app.mode=mock")
				.run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(AppModeGuard.class));
	}

	@Test
	void prod_with_mock_fails_to_start() {
		runner.withPropertyValues("spring.profiles.active=prod", "app.mode=mock")
				.run(ctx -> assertThat(ctx).hasFailed());
	}

	@Test
	void prod_with_live_starts() {
		runner.withPropertyValues("spring.profiles.active=prod", "app.mode=live")
				.run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(AppModeGuard.class));
	}

	/** 대소문자·공백은 허용함(환경변수 주입 실수를 기동 실패로 만들 필요는 없음) */
	@Test
	void mode_is_case_and_space_insensitive() {
		runner.withPropertyValues("spring.profiles.active=prod", "app.mode= LIVE ")
				.run(ctx -> assertThat(ctx).hasNotFailed());
	}
}
