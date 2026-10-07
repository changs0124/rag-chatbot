package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.ragchatbot.openai.OpenAiService.ChatInput;

/** 목업의 견본 그림 표식(FEAT-CHAT-004) - 키 없이도 그림 경로를 화면까지 재현할 수 있어야 한다 */
class OpenAiMockFigureTest {

	private final OpenAiMockService mock = new OpenAiMockService(0);

	private OpenAiService.ChatCompletion ask(String message, List<String> tokens) {
		return mock.streamChat(new ChatInput(message, List.of(), null, List.of()), tokens::add, (s, src) -> {
		});
	}

	@Test
	void figure_question_gets_sample_marker_with_source() {
		var tokens = new ArrayList<String>();
		var result = ask("드라이브 그림 보여줘", tokens);

		assertThat(result.fullText()).contains("\n[[그림:mock-sample]]\n");
		// 그림은 출처 문서에서 나온 것이므로 출처와 함께 온다 - 출처 0건이면 「자료 없음」 배너와 그림이 함께 떠 모순이다
		assertThat(result.citations()).isNotEmpty();
		// 8자씩 흘러가므로 표식이 토큰 경계에서 잘린다 - 프론트의 미완 표식 처리가 목업에서도 밟힌다
		assertThat(tokens).noneMatch(t -> t.contains("[[그림:mock-sample]]"));
	}

	@Test
	void other_questions_have_no_marker() {
		assertThat(ask("환불 정책 알려줘", new ArrayList<>()).fullText()).doesNotContain("[[그림:");
	}
}
