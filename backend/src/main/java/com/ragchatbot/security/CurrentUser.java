package com.ragchatbot.security;

import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ragchatbot.error.ApiExceptions.UnauthorizedException;

/**
 * SecurityContext에서 인증된 userId를 꺼내는 헬퍼.
 */
public final class CurrentUser {

	private CurrentUser() {
	}

	public static UUID id() {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		if (auth == null || !(auth.getPrincipal() instanceof UUID userId)) {
			throw new UnauthorizedException("인증 필요");
		}
		return userId;
	}
}
