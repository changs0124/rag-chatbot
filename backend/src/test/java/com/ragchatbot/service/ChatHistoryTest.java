package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.ragchatbot.entity.Message;
import com.ragchatbot.openai.OpenAiService.Turn;

/**
 * 이력 구성 규칙(ChatService.buildHistory). DB 없이 결정적으로 검증함 -
 * 자르는 규칙이 어긋나면 비용이 예측되지 않거나 대화가 끊긴 채 모델에 전달됨.
 */
class ChatHistoryTest {

	private static final int BUDGET = 6000;

	private static Message msg(String role, String content) {
		return new Message(UUID.randomUUID(), UUID.randomUUID(), role, content, "complete", false, null, null, null);
	}

	private static Message msg(String role, String content, String status, boolean stopped) {
		return new Message(UUID.randomUUID(), UUID.randomUUID(), role, content, status, stopped, null, null, null);
	}

	@Test
	void keeps_chronological_order() {
		List<Message> messages = List.of(
				msg("user", "첫 질문"),
				msg("assistant", "첫 답변"),
				msg("user", "둘째 질문"));

		List<Turn> history = ChatService.buildHistory(messages, Set.of(), BUDGET);

		assertThat(history).extracting(Turn::content)
				.containsExactly("첫 질문", "첫 답변", "둘째 질문");
		assertThat(history).extracting(Turn::role)
				.containsExactly("user", "assistant", "user");
	}

	/** 실패한 답변은 대화 맥락이 아님 - 넣으면 모델이 없던 답을 있었던 것으로 이어감 */
	@Test
	void drops_error_messages() {
		List<Message> messages = List.of(
				msg("user", "질문"),
				msg("assistant", "실패한 답변", "error", false),
				msg("user", "다시 질문"));

		List<Turn> history = ChatService.buildHistory(messages, Set.of(), BUDGET);

		assertThat(history).extracting(Turn::content).containsExactly("질문", "다시 질문");
	}

	/** 중단은 실패가 아님 - 사용자가 화면에서 실제로 본 내용이므로 맥락에 남아야 함 */
	@Test
	void keeps_stopped_messages() {
		List<Message> messages = List.of(msg("assistant", "중간까지 답한 내용", "complete", true));

		List<Turn> history = ChatService.buildHistory(messages, Set.of(), BUDGET);

		assertThat(history).extracting(Turn::content).containsExactly("중간까지 답한 내용");
	}

	@Test
	void marks_past_attachments_with_placeholder_instead_of_resending() {
		Message withImage = msg("user", "이거 뭐야");
		List<Turn> history = ChatService.buildHistory(List.of(withImage), Set.of(withImage.id()), BUDGET);

		assertThat(history).singleElement().extracting(Turn::content)
				.isEqualTo("이거 뭐야 " + ChatService.IMAGE_PLACEHOLDER);
	}

	/** 이미지만 보낸 턴도 흔적이 남아야 뒤 턴의 "그 사진"이 무엇인지 이어짐 */
	@Test
	void image_only_turn_survives_as_placeholder() {
		Message imageOnly = msg("user", "");
		List<Turn> history = ChatService.buildHistory(List.of(imageOnly), Set.of(imageOnly.id()), BUDGET);

		assertThat(history).singleElement().extracting(Turn::content)
				.isEqualTo(ChatService.IMAGE_PLACEHOLDER);
	}

	@Test
	void drops_empty_messages() {
		List<Message> messages = List.of(msg("user", ""), msg("assistant", "   "), msg("user", "질문"));

		List<Turn> history = ChatService.buildHistory(messages, Set.of(), BUDGET);

		assertThat(history).extracting(Turn::content).containsExactly("질문");
	}

	/**
	 * 예산을 넘기면 <b>오래된 쪽을 통째로 버림</b>. 개수가 아니라 예산으로 자르므로
	 * 긴 메시지 하나가 짧은 메시지 여럿보다 많이 밀어냄.
	 */
	@Test
	void trims_oldest_first_when_over_budget() {
		String long1500 = "가".repeat(1500); // 1500자 ≒ 1000토큰 - 예산 100 에 절대 못 들어감
		List<Message> messages = List.of(
				msg("user", long1500),
				msg("assistant", "첫 답변"),
				msg("user", "둘째 질문"),
				msg("assistant", "둘째 답변"));

		List<Turn> history = ChatService.buildHistory(messages, Set.of(), 100);

		// 최근 것부터 채우므로 맨 앞 긴 메시지만 밀려나고 나머지는 순서대로 남음
		assertThat(history).extracting(Turn::content)
				.containsExactly("첫 답변", "둘째 질문", "둘째 답변");
	}

	/**
	 * 예산을 넘긴 지점에서 <b>멈춤</b> - 중간을 건너뛰고 더 오래된 것을 주워 담으면
	 * 대화가 끊긴 채 전달돼 모델이 없는 맥락을 지어냄.
	 */
	@Test
	void stops_at_budget_instead_of_skipping_to_older_short_messages() {
		String long3000 = "가".repeat(3000); // 약 2000 토큰
		List<Message> messages = List.of(
				msg("user", "짧은 옛 질문"),
				msg("assistant", long3000),
				msg("user", "최근 질문"));

		List<Turn> history = ChatService.buildHistory(messages, Set.of(), 100);

		// 최근 질문만 들어감. 예산이 남았다고 "짧은 옛 질문"을 건너뛰어 담지 않음
		assertThat(history).extracting(Turn::content).containsExactly("최근 질문");
	}

	@Test
	void empty_conversation_yields_empty_history() {
		assertThat(ChatService.buildHistory(new ArrayList<>(), Set.of(), BUDGET)).isEmpty();
	}
}
