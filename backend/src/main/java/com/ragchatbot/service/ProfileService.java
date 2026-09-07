package com.ragchatbot.service;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.ragchatbot.entity.User;
import com.ragchatbot.exception.ApiExceptions.BadRequestException;
import com.ragchatbot.exception.ApiExceptions.NotFoundException;
import com.ragchatbot.exception.ApiExceptions.UnauthorizedException;
import com.ragchatbot.repository.UserRepository;
import com.ragchatbot.security.JwtService;
import com.ragchatbot.dto.AuthDtos.AuthResponse;
import com.ragchatbot.dto.AuthDtos.MeResponse;

/**
 * 마이페이지 - 이름/비밀번호/테마 변경 (AC-15·16). 소유자 본인만(userId는 JWT에서).
 */
@Service
public class ProfileService {

	private static final Set<String> THEMES = Set.of("light", "dark", "system");

	private final UserRepository userRepository;
	private final PasswordEncoder passwordEncoder;
	private final JwtService jwtService;

	public ProfileService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
		this.userRepository = userRepository;
		this.passwordEncoder = passwordEncoder;
		this.jwtService = jwtService;
	}

	public MeResponse me(UUID userId) {
		return toResponse(require(userId));
	}

	/** 갱신 후 한 번만 읽음 - 없는 사용자면 갱신이 0행이고 그 뒤 조회가 404 를 냄(선행 조회가 불필요) */
	public MeResponse updateName(UUID userId, String name) {
		userRepository.updateName(userId, name.trim());
		return toResponse(require(userId));
	}

	/**
	 * 비밀번호 변경 후 <b>새 토큰을 발급해 돌려줌</b>.
	 *
	 * <p>변경 시각 이전에 발급된 토큰은 전부 무효가 되므로(다른 기기 세션 포함), 발급하지 않으면
	 * 방금 "변경했습니다"를 본 <b>본인의 다음 요청부터 401</b>이 됨 - 성공이라고 말해 놓고 로그아웃시키는 꼴임.
	 * 여기서 새로 발급한 토큰만 기준선 이후라 살아남음.
	 *
	 * <p>기준선과 새 토큰의 {@code iat}를 <b>같은 시계(앱)</b>로 맞춤. DB의 {@code now()}를 기준선으로 쓰면
	 * DB 호스트 시계가 앞설 때 새 토큰이 발급 즉시 자기 기준선에 걸림(재리뷰 라운드 2 N-2).
	 */
	public AuthResponse updatePassword(UUID userId, String currentPassword, String newPassword) {
		User user = require(userId);
		if (!passwordEncoder.matches(currentPassword, user.passwordHash())) {
			throw new UnauthorizedException("현재 비밀번호가 올바르지 않음");
		}
		// 해시를 먼저 만들고 그 뒤에 기준선을 잼 - BCrypt 소요(0.1~0.5초)만큼 기준선이 과거로
		// 밀리면 그 사이 발급된 옛 토큰의 생존 창이 그만큼 넓어짐(재리뷰 라운드 3 ②)
		String hash = passwordEncoder.encode(newPassword);
		// JWT iat 는 초 단위로 내림되므로 기준선도 초로 자름 - 눈금이 같아야 같은 초 발급분이 살아남음
		OffsetDateTime changedAt = OffsetDateTime.now().truncatedTo(ChronoUnit.SECONDS);
		userRepository.updatePasswordHash(userId, hash, changedAt);
		// 갱신되는 값은 해시뿐이라 다시 읽지 않음
		return new AuthResponse(jwtService.issue(userId, user.email()), toResponse(user));
	}

	public MeResponse updateTheme(UUID userId, String theme) {
		if (!THEMES.contains(theme)) {
			throw new BadRequestException("허용되지 않은 테마: " + theme);
		}
		userRepository.updateTheme(userId, theme);
		return toResponse(require(userId));
	}

	private User require(UUID userId) {
		return userRepository.findById(userId).orElseThrow(() -> new NotFoundException("사용자 없음"));
	}

	private MeResponse toResponse(User u) {
		return new MeResponse(u.id(), u.email(), u.name(), u.theme(), u.role());
	}
}
