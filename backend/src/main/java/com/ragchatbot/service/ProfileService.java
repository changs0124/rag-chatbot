package com.ragchatbot.service;

import java.util.Set;
import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.ragchatbot.domain.User;
import com.ragchatbot.error.ApiExceptions.BadRequestException;
import com.ragchatbot.error.ApiExceptions.NotFoundException;
import com.ragchatbot.error.ApiExceptions.UnauthorizedException;
import com.ragchatbot.mapper.UserMapper;
import com.ragchatbot.web.dto.AuthDtos.MeResponse;

/**
 * 마이페이지 - 이름/비밀번호/테마 변경 (AC-15·16). 소유자 본인만(userId는 JWT에서).
 */
@Service
public class ProfileService {

	private static final Set<String> THEMES = Set.of("light", "dark", "system");

	private final UserMapper userMapper;
	private final PasswordEncoder passwordEncoder;

	public ProfileService(UserMapper userMapper, PasswordEncoder passwordEncoder) {
		this.userMapper = userMapper;
		this.passwordEncoder = passwordEncoder;
	}

	public MeResponse me(UUID userId) {
		return toResponse(require(userId));
	}

	public MeResponse updateName(UUID userId, String name) {
		require(userId);
		userMapper.updateName(userId, name.trim());
		return toResponse(require(userId));
	}

	public void updatePassword(UUID userId, String currentPassword, String newPassword) {
		User user = require(userId);
		if (!passwordEncoder.matches(currentPassword, user.passwordHash())) {
			throw new UnauthorizedException("현재 비밀번호가 올바르지 않음");
		}
		userMapper.updatePasswordHash(userId, passwordEncoder.encode(newPassword));
	}

	public MeResponse updateTheme(UUID userId, String theme) {
		require(userId);
		if (!THEMES.contains(theme)) {
			throw new BadRequestException("허용되지 않은 테마: " + theme);
		}
		userMapper.updateTheme(userId, theme);
		return toResponse(require(userId));
	}

	private User require(UUID userId) {
		return userMapper.findById(userId).orElseThrow(() -> new NotFoundException("사용자 없음"));
	}

	private MeResponse toResponse(User u) {
		return new MeResponse(u.id(), u.email(), u.name(), u.theme());
	}
}
