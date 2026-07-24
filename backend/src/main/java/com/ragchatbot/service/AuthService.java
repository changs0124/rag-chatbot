package com.ragchatbot.service;

import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.ragchatbot.domain.User;
import com.ragchatbot.error.ApiExceptions.ConflictException;
import com.ragchatbot.error.ApiExceptions.NotFoundException;
import com.ragchatbot.error.ApiExceptions.UnauthorizedException;
import com.ragchatbot.mapper.UserMapper;
import com.ragchatbot.security.JwtService;
import com.ragchatbot.web.dto.AuthDtos.AuthResponse;
import com.ragchatbot.web.dto.AuthDtos.LoginRequest;
import com.ragchatbot.web.dto.AuthDtos.MeResponse;
import com.ragchatbot.web.dto.AuthDtos.SignupRequest;

/**
 * 회원가입/로그인. 비밀번호는 BCrypt 해시로만 저장(AC-4).
 */
@Service
public class AuthService {

	private final UserMapper userMapper;
	private final PasswordEncoder passwordEncoder;
	private final JwtService jwtService;

	public AuthService(UserMapper userMapper, PasswordEncoder passwordEncoder, JwtService jwtService) {
		this.userMapper = userMapper;
		this.passwordEncoder = passwordEncoder;
		this.jwtService = jwtService;
	}

	public AuthResponse signup(SignupRequest req) {
		userMapper.findByEmail(req.email()).ifPresent(u -> {
			throw new ConflictException("이미 가입된 이메일");
		});
		UUID id = UUID.randomUUID();
		User user = new User(id, req.email(), passwordEncoder.encode(req.password()), req.name(), "system", null, null);
		userMapper.insert(user);
		return new AuthResponse(jwtService.issue(id, req.email()), new MeResponse(id, req.email(), req.name(), "system"));
	}

	public AuthResponse login(LoginRequest req) {
		User user = userMapper.findByEmail(req.email())
				.orElseThrow(() -> new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않음"));
		if (!passwordEncoder.matches(req.password(), user.passwordHash())) {
			throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않음");
		}
		return new AuthResponse(jwtService.issue(user.id(), user.email()),
				new MeResponse(user.id(), user.email(), user.name(), user.theme()));
	}

	public MeResponse me(UUID userId) {
		User user = userMapper.findById(userId)
				.orElseThrow(() -> new NotFoundException("사용자 없음"));
		return new MeResponse(user.id(), user.email(), user.name(), user.theme());
	}
}
