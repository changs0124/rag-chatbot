package com.ragchatbot.security;

import java.io.IOException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.auth0.jwt.interfaces.DecodedJWT;
import com.ragchatbot.repository.UserRepository;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Authorization: Bearer &lt;jwt&gt; 를 검증해 SecurityContext에 인증(principal=userId)을 심음.
 * 검증 실패/토큰 부재 시 인증을 심지 않음 → 보호 경로는 401(EntryPoint), permitAll은 통과.
 *
 * <p>서명 검증에 더해 <b>비밀번호 변경 시각</b>을 대조함(2026-07-28 결정). stateless JWT는 서버가
 * 회수할 수 없어, 비밀번호를 바꿔도 이미 나간 토큰이 만료까지 살아 있었음 - 탈취 대응이 성립하지 않음.
 * 대가로 인증 요청마다 사용자 행을 한 번 읽음(단일 인스턴스 전제, R-6).
 *
 * <p>만료가 임박한 토큰에는 {@value #REFRESH_HEADER} 로 새 토큰을 실어 보냄(FEAT-OPS-003).
 * 활동 중이면 만료가 계속 밀려, 업무 도중 세션이 끊겨 작성하던 내용이 날아가는 일을 막음.
 * 리프레시 토큰을 따로 두지 않은 이유는 기존 무효화 기준선 규칙과 그대로 호환되기 때문임.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	/** 슬라이딩 재발급 토큰을 싣는 응답 헤더. CorsConfig 의 노출 헤더 목록과 같은 값을 써야 함 */
	public static final String REFRESH_HEADER = "X-Refresh-Token";

	private final JwtService jwtService;
	private final UserRepository userRepository;

	public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
		this.jwtService = jwtService;
		this.userRepository = userRepository;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String header = request.getHeader("Authorization");
		if (header != null && header.startsWith("Bearer ")) {
			String token = header.substring(7);
			try {
				DecodedJWT jwt = jwtService.verify(token);
				UUID userId = UUID.fromString(jwt.getSubject());
				if (issuedBeforePasswordChange(jwt, userId)) {
					throw new IllegalStateException("비밀번호 변경 이전에 발급된 토큰");
				}
				var auth = new UsernamePasswordAuthenticationToken(userId, null, List.of());
				SecurityContextHolder.getContext().setAuthentication(auth);
				// 검증을 통과한 뒤에만 재발급함 - 무효한 토큰을 갱신해 주면 만료가 무의미해짐.
				// 헤더는 응답 본문보다 먼저 나가므로 SSE 처럼 스트리밍하는 경로에도 실림
				if (jwtService.needsRefresh(jwt)) {
					response.setHeader(REFRESH_HEADER, jwtService.issue(userId, jwt.getClaim("email").asString()));
				}
			} catch (Exception ex) {
				// 위조·만료·형식 오류·무효화된 토큰 - 인증 미설정(보호 경로에서 401로 귀결)
				SecurityContextHolder.clearContext();
			}
		}
		chain.doFilter(request, response);
	}

	/**
	 * JWT의 iat 는 초 단위로 내림되므로 변경 시각도 초로 잘라서 저장함(UserRepository.updatePasswordHash).
	 * 두 값의 눈금이 같아야 <b>변경 직후 재로그인한 토큰이 밀리초 차이로 거부되는</b> 일이 없음.
	 *
	 * <p>남는 틈은 <b>변경과 같은 초에 발급된 직전 토큰 1개</b>가 살아남는 것뿐임 - 수명이 1초 미만이고
	 * 그 토큰의 주인은 방금 비밀번호를 바꾼 본인이라 실질 위험이 없음.
	 */
	private boolean issuedBeforePasswordChange(DecodedJWT jwt, UUID userId) {
		OffsetDateTime changedAt = userRepository.findPasswordChangedAt(userId);
		if (changedAt == null) {
			return true; // 없는 사용자의 토큰은 유효하지 않음
		}
		Instant issuedAt = jwt.getIssuedAtAsInstant();
		return issuedAt == null || issuedAt.isBefore(changedAt.toInstant());
	}
}
