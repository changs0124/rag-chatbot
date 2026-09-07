package com.ragchatbot.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ragchatbot.security.CurrentUser;
import com.ragchatbot.service.ProfileService;
import com.ragchatbot.dto.AuthDtos.AuthResponse;
import com.ragchatbot.dto.AuthDtos.MeResponse;
import com.ragchatbot.dto.ProfileDtos.UpdateNameRequest;
import com.ragchatbot.dto.ProfileDtos.UpdatePasswordRequest;
import com.ragchatbot.dto.ProfileDtos.UpdateThemeRequest;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

	private final ProfileService profileService;

	public ProfileController(ProfileService profileService) {
		this.profileService = profileService;
	}

	@GetMapping
	public MeResponse me() {
		return profileService.me(CurrentUser.id());
	}

	@PatchMapping("/name")
	public MeResponse updateName(@Valid @RequestBody UpdateNameRequest req) {
		return profileService.updateName(CurrentUser.id(), req.name());
	}

	/** 변경 이전 토큰은 전부 무효가 되므로 새 토큰을 함께 돌려줌(클라이언트가 교체해야 세션이 이어짐) */
	@PatchMapping("/password")
	public AuthResponse updatePassword(@Valid @RequestBody UpdatePasswordRequest req) {
		return profileService.updatePassword(CurrentUser.id(), req.currentPassword(), req.newPassword());
	}

	@PatchMapping("/theme")
	public MeResponse updateTheme(@Valid @RequestBody UpdateThemeRequest req) {
		return profileService.updateTheme(CurrentUser.id(), req.theme());
	}
}
