package com.ragchatbot.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

public record Message(
		UUID id,
		UUID conversationId,
		String role,
		String content,
		String status,
		OffsetDateTime createdAt) {
}
