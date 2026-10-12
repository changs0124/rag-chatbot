package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.ragchatbot.storage.FileStorage;

/**
 * #248 : 구현 선택이 {@code AppModeGuard.normalize} 와 같은 규칙을 따른다.
 *
 * <p>종전에는 가드 · {@code @ConditionalOnProperty} · 원문 비교가 저마다 다른 규칙이었다. 구현 선택이 가드와
 * 같은 값을 보는지, 모드가 없을 때 어느 쪽도 올리지 않는지(종전 Mock 의 {@code matchIfMissing}) 를 DB 없이 두 빈만 올려 본다.
 */
class OpenAiServiceModeSelectionTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(OpenAiMockService.class, OpenAiRealService.class)
			.withBean(FileStorage.class, () -> mock(FileStorage.class))
			.withPropertyValues("app.openai.api-key=test-key");

	@Test
	void live_with_case_and_spaces_selects_real() {
		runner.withPropertyValues("app.mode= LIVE ").run(ctx -> {
			assertThat(ctx).hasNotFailed();
			assertThat(ctx).hasSingleBean(OpenAiRealService.class).doesNotHaveBean(OpenAiMockService.class);
		});
	}

	@Test
	void mock_with_case_and_spaces_selects_mock() {
		runner.withPropertyValues("app.mode= Mock").run(ctx -> {
			assertThat(ctx).hasNotFailed();
			assertThat(ctx).hasSingleBean(OpenAiMockService.class).doesNotHaveBean(OpenAiRealService.class);
		});
	}

	/** 모드가 없으면 어느 구현도 올리지 않는다 - 종전 Mock 의 matchIfMissing 은 클래스 주석과 모순이었다 */
	@Test
	void missing_mode_selects_neither() {
		runner.run(ctx -> assertThat(ctx).doesNotHaveBean(OpenAiMockService.class).doesNotHaveBean(OpenAiRealService.class));
	}
}
