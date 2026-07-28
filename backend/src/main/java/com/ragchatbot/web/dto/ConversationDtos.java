package com.ragchatbot.web.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.ragchatbot.web.dto.FileDtos.AttachmentResponse;

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

	/**
	 * 메시지 + 출처(P-6 재조회 시 유지, AC-7) + 첨부.
	 * 첨부 URL 은 조회 시점에 새로 서명함 - 저장된 URL 을 그대로 내리면 서명 토큰 TTL(15분) 뒤 404 가 됨.
	 */
	public record MessageResponse(UUID id, String role, String content, String status, OffsetDateTime createdAt,
			List<CitationResponse> citations, List<AttachmentResponse> attachments) {
	}
}
