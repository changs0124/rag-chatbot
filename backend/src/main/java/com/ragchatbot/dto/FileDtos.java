package com.ragchatbot.dto;

import java.util.UUID;

/**
 * 파일 응답 DTO. url은 서명 쿼리 토큰이 붙은 서빙 URL.
 */
public final class FileDtos {

	private FileDtos() {
	}

	public record AttachmentResponse(UUID id, String fileType, String url) {
	}
}
