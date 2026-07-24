package com.ragchatbot.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

public record Attachment(
		UUID id,
		UUID messageId,
		UUID userId,
		String storagePath,
		String fileType,
		String openaiFileId,
		OffsetDateTime createdAt) {
}
