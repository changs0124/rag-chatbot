package com.ragchatbot.service;

import java.util.Locale;
import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.ragchatbot.entity.User;
import com.ragchatbot.exception.ApiExceptions.NotFoundException;
import com.ragchatbot.exception.ApiExceptions.UnauthorizedException;
import com.ragchatbot.repository.UserRepository;
import com.ragchatbot.security.JwtService;
import com.ragchatbot.dto.AuthDtos.AuthResponse;
import com.ragchatbot.dto.AuthDtos.LoginRequest;
import com.ragchatbot.dto.AuthDtos.MeResponse;

/**
 * 로그인. 비밀번호는 BCrypt 해시로만 저장(AC-4).
 *
 * <p><b>계정을 만드는 경로가 여기 없다</b>(2026-09-07). 발급은 관리자만 할 수 있고
 * {@code AdminUserService.create()} 가 담당한다.
 *
 * <p>이메일은 <b>소문자로 정규화</b>해 저장·조회함(2026-07-28 결정). 그러지 않으면 같은 주소가
 * 대소문자만 달라 별개 계정이 되고, 사용자는 "가입했는데 로그인이 안 되는" 상태를 만남.
 * DB에도 {@code lower(email)} 유일 인덱스를 두어 앱을 우회한 삽입까지 막음(V2 마이그레이션).
 */
@Service
public class AuthService {

	private final UserRepository userRepository;
	private final PasswordEncoder passwordEncoder;
	private final JwtService jwtService;
	private final RateLimiterService rateLimiter;

	public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
			RateLimiterService rateLimiter) {
		this.userRepository = userRepository;
		this.passwordEncoder = passwordEncoder;
		this.jwtService = jwtService;
		this.rateLimiter = rateLimiter;
	}

	public AuthResponse login(LoginRequest req) {
		String email = normalizeEmail(req.email());
		rateLimiter.checkLoginAllowed(email); // 실패 누적이 한도를 넘었으면 더 받지 않음
		var found = userRepository.findByEmail(email);
		// 계정 유무와 비밀번호 불일치를 **같은 응답 본문·상태 코드**로 돌려줌(존재 은닉) + 실패만 계수.
		// 응답 한정임 - 미존재 계정은 BCrypt 를 건너뛰어 응답 시간이 갈리는 타이밍 오라클이 남음(기존 동작)
		if (found.isEmpty() || !passwordEncoder.matches(req.password(), found.get().passwordHash())) {
			rateLimiter.recordLoginFailure(email);
			throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않음");
		}
		User user = found.get();
		return new AuthResponse(jwtService.issue(user.id(), user.email()),
				new MeResponse(user.id(), user.email(), user.name(), user.theme(), user.role()));
	}

	public MeResponse me(UUID userId) {
		User user = userRepository.findById(userId)
				.orElseThrow(() -> new NotFoundException("사용자 없음"));
		return new MeResponse(user.id(), user.email(), user.name(), user.theme(), user.role());
	}

	private static String normalizeEmail(String email) {
		return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
	}
}
