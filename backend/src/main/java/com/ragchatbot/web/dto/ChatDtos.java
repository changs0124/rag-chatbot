package com.ragchatbot.web.dto;

import java.util.List;
import java.util.UUID;

import com.ragchatbot.web.dto.ConversationDtos.CitationResponse;

/**
 * 채팅 요청/응답 DTO. Phase 4는 비스트리밍 JSON, Phase 5에서 SSE로 전환.
 */
public final class ChatDtos {

	private ChatDtos() {
	}

	/** message는 첨부가 있으면 비어도 됨(AC-21, 이미지 단독 질문) */
	public record ChatRequest(UUID conversationId, String message, List<UUID> attachmentIds) {
	}

	public record ChatResponse(UUID messageId, String content, boolean noSource, List<CitationResponse> citations) {
	}
}
