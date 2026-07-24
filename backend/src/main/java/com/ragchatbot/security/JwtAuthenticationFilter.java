package com.ragchatbot.security;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.auth0.jwt.interfaces.DecodedJWT;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Authorization: Bearer <jwt> 를 검증해 SecurityContext에 인증(principal=userId)을 심음.
 * 검증 실패/토큰 부재 시 인증을 심지 않음 → 보호 경로는 401(EntryPoint), permitAll은 통과.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final JwtService jwtService;

	public JwtAuthenticationFilter(JwtService jwtService) {
		this.jwtService = jwtService;
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
				var auth = new UsernamePasswordAuthenticationToken(userId, null, List.of());
				SecurityContextHolder.getContext().setAuthentication(auth);
			} catch (Exception ex) {
				// 위조·만료·형식 오류 - 인증 미설정(보호 경로에서 401로 귀결)
				SecurityContextHolder.clearContext();
			}
		}
		chain.doFilter(request, response);
	}
}
