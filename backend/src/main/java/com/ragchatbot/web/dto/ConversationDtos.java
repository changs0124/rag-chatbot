package com.ragchatbot.web.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 대화/메시지 응답·요청 DTO.
 */
public final class ConversationDtos {

	private ConversationDtos() {
	}

	public record CreateConversationRequest(String title) {
	}

	public record RenameConversationRequest(@jakarta.validation.constraints.NotBlank String title) {
	}

	public record ConversationResponse(UUID id, String title, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
	}

	public record CitationResponse(int seq, String sourceName, String snippet, String uri) {
	}

	/** 메시지 + 출처(P-6 재조회 시 유지, AC-7) */
	public record MessageResponse(UUID id, String role, String content, String status, OffsetDateTime createdAt,
			List<CitationResponse> citations) {
	}
}
