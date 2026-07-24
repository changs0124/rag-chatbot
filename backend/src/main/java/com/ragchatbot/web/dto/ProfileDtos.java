package com.ragchatbot.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 마이페이지 - 이름/비밀번호/테마 변경 요청 DTO (AC-15·16).
 */
public final class ProfileDtos {

	private ProfileDtos() {
	}

	public record UpdateNameRequest(@NotBlank String name) {
	}

	public record UpdatePasswordRequest(
			@NotBlank String currentPassword,
			@NotBlank @Size(min = 8, message = "비밀번호는 8자 이상") String newPassword) {
	}

	public record UpdateThemeRequest(@NotBlank String theme) {
	}
}
