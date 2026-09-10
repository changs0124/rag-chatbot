package com.ragchatbot.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.ragchatbot.dto.FileDtos.AttachmentResponse;

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
	 * {@code stopped} 는 중단으로 끝나 <b>출처 판정을 못 마친</b> 답변임 - 화면이 무자료 배너를 억제하는 데 씀.
	 * {@code timedOut} 은 <b>서버가 스트림을 타임아웃으로 닫았음</b>(#84). {@code stopped} 와 별개의 축이며
	 * 함께 참일 수 있음 - 두 값의 조합으로 「사용자가 끊음」·「서버가 닫는 중 잘림」·「닫힌 뒤 전문 도착」이 갈림.
	 */
	public record MessageResponse(UUID id, String role, String content, String status, boolean stopped,
			boolean timedOut, OffsetDateTime createdAt, List<CitationResponse> citations,
			List<AttachmentResponse> attachments) {
	}
}
