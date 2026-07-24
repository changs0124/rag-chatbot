package com.ragchatbot.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Phase 0 스모크 - 헬스 엔드포인트가 status ok를 반환하는지 단위 검사.
 * HTTP/permitAll 레벨 검증은 풀 컨텍스트가 뜨는 AuthFlowTest.health_is_public 에서 함.
 */
class HealthControllerTest {

	@Test
	void health_returns_ok() {
		assertThat(new HealthController().health()).containsEntry("status", "ok");
	}
}
