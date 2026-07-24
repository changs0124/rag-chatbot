package com.ragchatbot.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * AC-18 : prod 프로필에서 mock 이면 기동 실패. 가드 로직을 컨텍스트 없이 직접 검증함.
 */
class ProdModeGuardTest {

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
}
