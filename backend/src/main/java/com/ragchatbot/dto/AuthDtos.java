package com.ragchatbot.dto;

import java.util.UUID;

import com.ragchatbot.entity.User;

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
	public record MeResponse(UUID id, String email, String name, String role) {

		/** 로그인·마이페이지가 같은 모양을 내도록 한 곳에서 만든다(#389) */
		public static MeResponse of(User u) {
			return new MeResponse(u.id(), u.email(), u.name(), u.role());
		}
	}

	public record AuthResponse(String token, MeResponse user) {
	}
}
