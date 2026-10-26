package com.ragchatbot.service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Predicate;

import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.service.ChatService.PreparedChat;

/**
 * {@code ChatService.stream} 을 손으로 만든 대역 위에서 돌리는 테스트들의 공용 바탕.
 *
 * <p>{@code ChatStreamAbortTest} · {@code ChatStreamTimeoutTest} 가 대역을 한 벌씩 들고 있으면
 * {@code OpenAiService} 메서드 하나를 늘릴 때마다 두 곳을 고쳐야 한다(#329).
 */
final class ChatStreamTestSupport {

	private ChatStreamTestSupport() {
	}

	/** 채팅 경로만 쓰는 OpenAI 대역의 바탕 - 하위 클래스는 {@code streamChat} 만 구현한다 */
	abstract static class ChatOnlyOpenAi implements OpenAiService {

		@Override
		public String stageLabel(Stage stage, List<String> sources, boolean withImage) {
			return stage.name();
		}

		// 이 대역은 **채팅 경로만** 검증함. 문서 관리(FEAT-ADMIN-002)를 부르는 일이 없으므로
		// 조용한 기본값 대신 던지게 둠 - 나중에 이 경로가 실수로 여기로 흘러오면 바로 드러남
		@Override
		public boolean hasSharedVectorStore() {
			throw new UnsupportedOperationException("채팅 전용 대역");
		}

		@Override
		public UploadedDocument uploadDocument(String filename, byte[] content) {
			throw new UnsupportedOperationException("채팅 전용 대역");
		}

		@Override
		public String documentStatus(String vectorStoreId, String openaiFileId) {
			throw new UnsupportedOperationException("채팅 전용 대역");
		}

		@Override
		public void deleteDocument(String vectorStoreId, String openaiFileId) {
			throw new UnsupportedOperationException("채팅 전용 대역");
		}

		@Override
		public List<StoreFile> listStoreFiles(Predicate<String> needsDetail) {
			throw new UnsupportedOperationException("채팅 전용 대역");
		}
	}

	record Saved(String content, String status, boolean stopped, boolean timedOut,
			List<OpenAiService.CitationData> citations, Integer inputTokens, Integer outputTokens) {
	}

	/** 저장 호출을 기록만 하는 대역 */
	static final class RecordingPersistence extends ChatPersistenceService {
		final List<Saved> saves = new ArrayList<>();
		/** 걷은 질문 id(#489) */
		final List<UUID> retracted = new ArrayList<>();
		/** 첫 저장을 던지게 함 - 스트림 완주 뒤 저장 실패 경로를 만드는 데 씀(#97) */
		private int failFirst;

		RecordingPersistence() {
			super(null, null, null, null);
		}

		RecordingPersistence failingFirstSave() {
			this.failFirst = 1;
			return this;
		}

		@Override
		public void saveAssistant(UUID conversationId, UUID userId, UUID assistantMsgId, String content, String status,
				boolean stopped, boolean timedOut, List<OpenAiService.CitationData> citations, Integer inputTokens,
				Integer outputTokens) {
			if (failFirst > 0) {
				failFirst--;
				throw new IllegalStateException("DB 커넥션 끊김");
			}
			saves.add(new Saved(content, status, stopped, timedOut, citations, inputTokens, outputTokens));
		}

		@Override
		public void retractQuestion(UUID conversationId, UUID userMessageId) {
			retracted.add(userMessageId);
		}
	}

	static PreparedChat prepared() {
		return new PreparedChat(UUID.randomUUID(), UUID.randomUUID(), "질문", List.of(), List.of());
	}

	static ChatService chatService(OpenAiService openAi, ChatPersistenceService persistence) {
		return new ChatService(null, null, null, openAi, persistence, 6000, 4000, 5);
	}
}
