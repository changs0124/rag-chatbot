package com.ragchatbot.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ragchatbot.security.CurrentUser;
import com.ragchatbot.service.ProfileService;
import com.ragchatbot.web.dto.AuthDtos.MeResponse;
import com.ragchatbot.web.dto.ProfileDtos.UpdateNameRequest;
import com.ragchatbot.web.dto.ProfileDtos.UpdatePasswordRequest;
import com.ragchatbot.web.dto.ProfileDtos.UpdateThemeRequest;

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

	@PatchMapping("/password")
	public ResponseEntity<Void> updatePassword(@Valid @RequestBody UpdatePasswordRequest req) {
		profileService.updatePassword(CurrentUser.id(), req.currentPassword(), req.newPassword());
		return ResponseEntity.noContent().build();
	}

	@PatchMapping("/theme")
	public MeResponse updateTheme(@Valid @RequestBody UpdateThemeRequest req) {
		return profileService.updateTheme(CurrentUser.id(), req.theme());
	}
}
