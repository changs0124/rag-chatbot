package com.ragchatbot.web.dto;

import java.util.List;
import java.util.UUID;

/**
 * 채팅 요청 DTO. 응답은 SSE(meta→token→citations→done) 스트림.
 */
public final class ChatDtos {

	private ChatDtos() {
	}

	/** message는 첨부가 있으면 비어도 됨(AC-21, 이미지 단독 질문) */
	public record ChatRequest(UUID conversationId, String message, List<UUID> attachmentIds) {
	}
}
