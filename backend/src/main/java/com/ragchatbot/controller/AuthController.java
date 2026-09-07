package com.ragchatbot.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ragchatbot.security.CurrentUser;
import com.ragchatbot.service.AuthService;
import com.ragchatbot.dto.AuthDtos.AuthResponse;
import com.ragchatbot.dto.AuthDtos.LoginRequest;
import com.ragchatbot.dto.AuthDtos.MeResponse;
import com.ragchatbot.dto.AuthDtos.SignupRequest;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

	private final AuthService authService;

	public AuthController(AuthService authService) {
		this.authService = authService;
	}

	@PostMapping("/signup")
	public AuthResponse signup(@Valid @RequestBody SignupRequest req) {
		return authService.signup(req);
	}

	@PostMapping("/login")
	public AuthResponse login(@Valid @RequestBody LoginRequest req) {
		return authService.login(req);
	}

	/** 인증 필요(permitAll 아님) */
	@GetMapping("/me")
	public MeResponse me() {
		return authService.me(CurrentUser.id());
	}
}
