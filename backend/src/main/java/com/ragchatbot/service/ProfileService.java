package com.ragchatbot.service;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
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
 * 마이페이지 - 이름/비밀번호 변경. 소유자 본인만(userId는 JWT에서).
 */
@Service
public class ProfileService {

	/** BCrypt 가 받는 최대 입력. 넘으면 {@code encode} 가 {@link IllegalArgumentException} 을 던져 500 이 된다(#359) */
	private static final int BCRYPT_MAX_BYTES = 72;

	private final UserRepository userRepository;
	private final PasswordEncoder passwordEncoder;
	private final JwtService jwtService;
	private final int maxNameChars;

	public ProfileService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
			@Value("${app.user.max-name-chars}") int maxNameChars) {
		this.userRepository = userRepository;
		this.passwordEncoder = passwordEncoder;
		this.jwtService = jwtService;
		this.maxNameChars = maxNameChars;
	}

	public MeResponse me(UUID userId) {
		return MeResponse.of(require(userId));
	}

	/** 갱신 후 한 번만 읽음 - 없는 사용자면 갱신이 0행이고 그 뒤 조회가 404 를 냄(선행 조회가 불필요) */
	public MeResponse updateName(UUID userId, String name) {
		userRepository.updateName(userId, requireNameLength(name.trim(), maxNameChars));
		return MeResponse.of(require(userId));
	}

	/**
	 * 비밀번호 변경 후 <b>새 토큰을 발급해 돌려줌</b>.
	 *
	 * <p>변경 시각 이전에 발급된 토큰은 전부 무효가 되므로(다른 기기 세션 포함), 발급하지 않으면
	 * 방금 "변경했습니다"를 본 <b>본인의 다음 요청부터 401</b>이 됨 - 성공이라고 말해 놓고 로그아웃시키는 꼴임.
	 * 여기서 새로 발급한 토큰만 기준선 이후라 살아남음.
	 *
	 * <p>기준선과 새 토큰의 {@code iat}를 <b>같은 시계(앱)</b>로 맞춤 - 이유는 {@code UserRepository#updatePasswordHash}.
	 */
	public AuthResponse updatePassword(UUID userId, String currentPassword, String newPassword) {
		User user = require(userId);
		if (!passwordEncoder.matches(currentPassword, user.passwordHash())) {
			throw new UnauthorizedException("현재 비밀번호가 올바르지 않음");
		}
		// 글자 수가 아니라 UTF-8 바이트로 잰다 - 한글 25자가 75바이트라 평범한 한글 문장이 걸린다
		if (newPassword.getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
			throw new BadRequestException("비밀번호가 너무 김(UTF-8 " + BCRYPT_MAX_BYTES + "바이트 이하, 한글은 24자까지)");
		}
		// 해시를 먼저 만들고 그 뒤에 기준선을 잼 - BCrypt 소요(0.1~0.5초)만큼 기준선이 과거로
		// 밀리면 그 사이 발급된 옛 토큰의 생존 창이 그만큼 넓어짐
		String hash = passwordEncoder.encode(newPassword);
		// JWT iat 는 초 단위로 내림되므로 기준선도 초로 자름 - 눈금이 같아야 같은 초 발급분이 살아남음
		OffsetDateTime changedAt = OffsetDateTime.now().truncatedTo(ChronoUnit.SECONDS);
		userRepository.updatePasswordHash(userId, hash, changedAt);
		// 갱신되는 값은 해시뿐이라 다시 읽지 않음
		return new AuthResponse(jwtService.issue(userId), MeResponse.of(user));
	}

	/**
	 * 표시 이름 길이 상한(#413). 잘라 저장하지 않고 거절한다 - 자르면 사용자가 쓴 것과 다른 이름이 조용히 남는다.
	 * 코드 포인트로 셈 - length() 면 이모지 하나가 두 자로 세진다. 계정 발급({@code AdminUserService})도 같은 규칙을 쓴다
	 */
	static String requireNameLength(String name, int maxNameChars) {
		TextInputs.requireStorable(name, "이름");
		if (name.codePointCount(0, name.length()) > maxNameChars) {
			throw new BadRequestException("이름은 " + maxNameChars + "자까지 쓸 수 있음");
		}
		return name;
	}

	private User require(UUID userId) {
		return userRepository.findById(userId).orElseThrow(() -> new NotFoundException("사용자 없음"));
	}
}
