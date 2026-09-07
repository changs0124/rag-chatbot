package com.ragchatbot.dto;

import java.util.UUID;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * 인증 요청/응답 DTO.
 */
public final class AuthDtos {

	private AuthDtos() {
	}

	public record LoginRequest(
			@Email @NotBlank String email,
			@NotBlank String password) {
	}

	/** role 은 프론트가 관리 메뉴 노출을 판단하는 값임. **표시 판단일 뿐 접근 제어가 아님** - 차단은 서버가 함 */
	public record MeResponse(UUID id, String email, String name, String theme, String role) {
	}

	public record AuthResponse(String token, MeResponse user) {
	}
}
