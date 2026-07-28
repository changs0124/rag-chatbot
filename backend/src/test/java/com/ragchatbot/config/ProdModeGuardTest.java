package com.ragchatbot.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * AC-18 : prod 프로필에서 mock 이면 기동 실패.
 *
 * 생성자 단위 검증만 두면 {@code @Profile("prod")} 결합과 {@code app.mode} 바인딩이 검사되지 않아,
 * 프로필 이름을 오타 내거나 프로퍼티 키를 바꿔도 초록이 됨(2026-07-28 Phase 0 리뷰 M-1).
 * 그래서 실제 컨텍스트를 띄워 4가지 조합을 고정함.
 */
class ProdModeGuardTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(ProdModeGuard.class);

	@Test
	void prod_with_mock_fails() {
		assertThatThrownBy(() -> new ProdModeGuard("mock"))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("AC-18");
	}

	@Test
	void prod_with_live_ok() {
		assertThatCode(() -> new ProdModeGuard("live")).doesNotThrowAnyException();
	}

	@Test
	void context_prod_with_mock_fails_to_start() {
		runner.withPropertyValues("spring.profiles.active=prod", "app.mode=mock")
				.run(ctx -> assertThat(ctx).hasFailed());
	}

	/** APP_MODE 를 아예 주지 않아도 기본값이 mock 이므로 prod 에서는 기동 실패여야 함(fail-safe). */
	@Test
	void context_prod_without_app_mode_fails_to_start() {
		runner.withPropertyValues("spring.profiles.active=prod")
				.run(ctx -> assertThat(ctx).hasFailed());
	}

	@Test
	void context_prod_with_live_starts() {
		runner.withPropertyValues("spring.profiles.active=prod", "app.mode=live")
				.run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(ProdModeGuard.class));
	}

	/**
	 * 현행 계약을 명시적으로 못 박음 - **프로필을 지정하지 않으면 가드 빈 자체가 생기지 않음**.
	 * 즉 AC-18 은 "prod 프로필이 켜져 있을 때"만 성립하며, 프로필을 켜는 책임은 배포 설정에 있음.
	 * 이 한계는 docs/02_운영.md 처리 이력 「AC-18 가드 활성화 경로」 행에 등재돼 있음.
	 */
	@Test
	void context_without_profile_starts_even_with_mock() {
		runner.withPropertyValues("app.mode=mock")
				.run(ctx -> assertThat(ctx).hasNotFailed().doesNotHaveBean(ProdModeGuard.class));
	}
}
