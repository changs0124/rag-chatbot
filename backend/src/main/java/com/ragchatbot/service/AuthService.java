package com.ragchatbot.service;

import java.util.Locale;
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
 *
 * <p>이메일은 <b>소문자로 정규화</b>해 저장·조회함(2026-07-28 결정). 그러지 않으면 같은 주소가
 * 대소문자만 달라 별개 계정이 되고, 사용자는 "가입했는데 로그인이 안 되는" 상태를 만남.
 * DB에도 {@code lower(email)} 유일 인덱스를 두어 앱을 우회한 삽입까지 막음(V2 마이그레이션).
 */
@Service
public class AuthService {

	private final UserMapper userMapper;
	private final PasswordEncoder passwordEncoder;
	private final JwtService jwtService;
	private final RateLimiterService rateLimiter;

	public AuthService(UserMapper userMapper, PasswordEncoder passwordEncoder, JwtService jwtService,
			RateLimiterService rateLimiter) {
		this.userMapper = userMapper;
		this.passwordEncoder = passwordEncoder;
		this.jwtService = jwtService;
		this.rateLimiter = rateLimiter;
	}

	public AuthResponse signup(SignupRequest req) {
		String email = normalizeEmail(req.email());
		userMapper.findByEmail(email).ifPresent(u -> {
			throw new ConflictException("이미 가입된 이메일");
		});
		UUID id = UUID.randomUUID();
		User user = new User(id, email, passwordEncoder.encode(req.password()), req.name(), "system", null, null);
		userMapper.insert(user);
		return new AuthResponse(jwtService.issue(id, email), new MeResponse(id, email, req.name(), "system"));
	}

	public AuthResponse login(LoginRequest req) {
		String email = normalizeEmail(req.email());
		rateLimiter.checkLoginAllowed(email); // 실패 누적이 한도를 넘었으면 더 받지 않음
		var found = userMapper.findByEmail(email);
		// 계정 유무와 비밀번호 불일치를 **같은 응답 본문·상태 코드**로 돌려줌(존재 은닉) + 실패만 계수.
		// 응답 한정임 - 미존재 계정은 BCrypt 를 건너뛰어 응답 시간이 갈리는 타이밍 오라클이 남음(기존 동작)
		if (found.isEmpty() || !passwordEncoder.matches(req.password(), found.get().passwordHash())) {
			rateLimiter.recordLoginFailure(email);
			throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않음");
		}
		User user = found.get();
		return new AuthResponse(jwtService.issue(user.id(), user.email()),
				new MeResponse(user.id(), user.email(), user.name(), user.theme()));
	}

	public MeResponse me(UUID userId) {
		User user = userMapper.findById(userId)
				.orElseThrow(() -> new NotFoundException("사용자 없음"));
		return new MeResponse(user.id(), user.email(), user.name(), user.theme());
	}

	private static String normalizeEmail(String email) {
		return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
	}
}
