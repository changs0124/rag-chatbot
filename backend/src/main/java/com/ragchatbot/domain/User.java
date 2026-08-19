package com.ragchatbot.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 사용자. 비밀번호는 해시만 보관(BCrypt, Phase 2). theme: light|dark|system.
 *
 * <p>{@code role} 은 {@code user} 또는 {@code admin}(V5, FEAT-ADMIN-001). 승격·강등은
 * 환경변수 {@code ADMIN_EMAILS} 명단으로만 일어나며 앱에 권한 상승 API 가 없음.
 * <b>JWT 클레임에 담지 않음</b> - 담으면 강등이 토큰 만료까지 반영되지 않음.
 */
public record User(
		UUID id,
		String email,
		String passwordHash,
		String name,
		String theme,
		String role,
		OffsetDateTime createdAt,
		OffsetDateTime updatedAt) {
}
