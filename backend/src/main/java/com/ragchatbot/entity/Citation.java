package com.ragchatbot.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 출처(각주). 메시지에 영속화(P-6) - SSE로만 보내 소실시키지 않음.
 */
public record Citation(
		UUID id,
		UUID messageId,
		int seq,
		String sourceName,
		String snippet,
		String uri,
		OffsetDateTime createdAt) {
}
