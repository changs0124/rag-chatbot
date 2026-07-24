package com.ragchatbot.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 사용자. 비밀번호는 해시만 보관(BCrypt, Phase 2). theme: light|dark|system.
 */
public record User(
		UUID id,
		String email,
		String passwordHash,
		String name,
		String theme,
		OffsetDateTime createdAt,
		OffsetDateTime updatedAt) {
}
