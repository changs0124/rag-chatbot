package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 리스크 R-9 : Vector Stores 베타 API 가 바뀌어도 목업 경로가 실 API 에 닿지 않아야 함.
 *
 * <p>완화 수단은 {@code @ConditionalOnProperty} 로 두 구현을 배타 등록하는 것인데, <b>그것이 실제로
 * 걸려 있는지 재는 케이스가 없었음</b>(2026-07-28 리스크 표 정비에서 드러남). 조건을 지우거나 값을
 * 잘못 적으면 목업 컨텍스트에 Real 이 함께 올라오고, 그때 이 테스트가 빨간불이 됨.
 *
 * <p>라이브 방향(모드 미설정·오타 시 기동 실패)은 {@code AppModeGuardTest} 가 담당함.
 */
class OpenAiServiceBoundaryTest extends AbstractPgIntegrationTest {

	@Autowired
	private ApplicationContext ctx;

	/** mock 모드 컨텍스트에는 구현이 하나뿐이고 그것이 Mock 이어야 함 */
	@Test
	void mock_mode_registers_only_mock_implementation() {
		var impls = ctx.getBeansOfType(OpenAiService.class);
		assertThat(impls).hasSize(1);
		assertThat(impls.values().iterator().next()).isInstanceOf(OpenAiMockService.class);
	}

	/** Real 은 빈으로 존재조차 하지 않아야 함 - 존재하면 주입 대상이 될 수 있음 */
	@Test
	void mock_mode_has_no_real_service_bean() {
		assertThat(ctx.getBeanNamesForType(OpenAiRealService.class)).isEmpty();
	}
}
