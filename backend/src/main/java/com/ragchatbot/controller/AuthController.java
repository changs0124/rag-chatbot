package com.ragchatbot.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ragchatbot.security.CurrentUser;
import com.ragchatbot.service.AuthService;
import com.ragchatbot.service.ProfileService;
import com.ragchatbot.dto.AuthDtos.AuthResponse;
import com.ragchatbot.dto.AuthDtos.LoginRequest;
import com.ragchatbot.dto.AuthDtos.MeResponse;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

	private final AuthService authService;
	// 내 정보 조회는 프로필 쪽이 정본이다 - 같은 조회를 AuthService 에도 두었더니 사본이 둘이었다(#219)
	private final ProfileService profileService;

	public AuthController(AuthService authService, ProfileService profileService) {
		this.authService = authService;
		this.profileService = profileService;
	}

	@PostMapping("/login")
	public AuthResponse login(@Valid @RequestBody LoginRequest req) {
		return authService.login(req);
	}

	/** 인증 필요(permitAll 아님) */
	@GetMapping("/me")
	public MeResponse me() {
		return profileService.me(CurrentUser.id());
	}
}
