package com.ragchatbot.web.dto;

import java.util.UUID;

/**
 * 파일 응답 DTO. url은 서명 경로 토큰이 붙은 서빙 URL(M6/AC-22).
 */
public final class FileDtos {

	private FileDtos() {
	}

	public record AttachmentResponse(UUID id, String fileType, String url) {
	}
}
