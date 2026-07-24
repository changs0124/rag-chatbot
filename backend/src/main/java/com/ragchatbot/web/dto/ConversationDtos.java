package com.ragchatbot.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 대화/메시지 응답·요청 DTO.
 */
public final class ConversationDtos {

	private ConversationDtos() {
	}

	public record CreateConversationRequest(String title) {
	}

	public record ConversationResponse(UUID id, String title, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
	}

	public record MessageResponse(UUID id, String role, String content, String status, OffsetDateTime createdAt) {
	}
}
