package com.ragchatbot.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

public record Conversation(
		UUID id,
		UUID userId,
		String title,
		String vectorStoreId,
		OffsetDateTime createdAt,
		OffsetDateTime updatedAt) {
}
