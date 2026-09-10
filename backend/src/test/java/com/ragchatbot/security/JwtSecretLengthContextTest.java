package com.ragchatbot.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * 짧은 시크릿이 <b>실제로 기동을 막는지</b> 컨텍스트를 띄워 확인 (보안 리뷰 F1).
 *
 * <p><b>{@link JwtSecretPolicyTest} 와 나눈 이유</b> : 그쪽은 판정 로직을 보고 이쪽은
 * <b>프로퍼티 바인딩</b>을 본다. 생성자 단위 검증만 두면 {@code @Value} 키를 바꾸거나 오타를 내도
 * 초록이 된다 - {@code AppModeGuardTest} 가 2026-07-28 Phase 0 리뷰(M-1)에서 같은 이유로
 * {@code ApplicationContextRunner} 로 옮겨 갔고, 이 파일은 그 형태를 따른다.
 *
 * <p>Docker 도 DB 도 필요 없다.
 */
class JwtSecretLengthContextTest {

	/** 32바이트를 넘는 값. 통합 테스트가 쓰는 것과 같은 형태 */
	private static final String VALID_SECRET = "test-secret-please-change-0123456789abcdef";

	private final ApplicationContextRunner authRunner = new ApplicationContextRunner()
			.withUserConfiguration(JwtService.class);

	private final ApplicationContextRunner fileRunner = new ApplicationContextRunner()
			.withUserConfiguration(FileAccessTokenService.class);

	@Test
	void short_secret_fails_auth_token_service_startup() {
		authRunner.withPropertyValues("app.jwt.secret=too-short")
				.run(ctx -> assertThat(ctx).hasFailed());
	}

	@Test
	void short_secret_fails_file_token_service_startup() {
		fileRunner.withPropertyValues("app.jwt.secret=too-short")
				.run(ctx -> assertThat(ctx).hasFailed());
	}

	/**
	 * 반대편 - 충분한 시크릿이면 뜬다.
	 *
	 * <p>이 케이스가 없으면 "무조건 실패하는 구현" 도 위 두 케이스를 통과한다.
	 */
	@Test
	void sufficient_secret_starts_both_services() {
		authRunner.withPropertyValues("app.jwt.secret=" + VALID_SECRET)
				.run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(JwtService.class));
		fileRunner.withPropertyValues("app.jwt.secret=" + VALID_SECRET)
				.run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(FileAccessTokenService.class));
	}

	/** 미설정도 여전히 막힌다 - 길이 검사를 넣으며 종전 경로를 잃지 않았는지 */
	@Test
	void missing_secret_still_fails_startup() {
		authRunner.run(ctx -> assertThat(ctx).hasFailed());
	}
}
