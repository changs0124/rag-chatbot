package com.ragchatbot.web.dto;

import java.util.UUID;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 인증 요청/응답 DTO.
 */
public final class AuthDtos {

	private AuthDtos() {
	}

	public record SignupRequest(
			@Email @NotBlank String email,
			@NotBlank @Size(min = 8, message = "비밀번호는 8자 이상") String password,
			@NotBlank String name) {
	}

	public record LoginRequest(
			@Email @NotBlank String email,
			@NotBlank String password) {
	}

	public record MeResponse(UUID id, String email, String name, String theme) {
	}

	public record AuthResponse(String token, MeResponse user) {
	}
}
