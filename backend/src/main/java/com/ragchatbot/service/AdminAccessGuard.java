package com.ragchatbot.service;

import java.util.UUID;

import org.springframework.stereotype.Service;

import com.ragchatbot.error.ApiExceptions.NotFoundException;
import com.ragchatbot.mapper.UserMapper;

/**
 * 관리자 권한 확인(FEAT-ADMIN-001).
 *
 * <p><b>권한 없음을 403 이 아니라 404 로 돌려준다</b>(P-3, 소유권 위반과 같은 규칙). 403 은
 * "거기 뭔가 있다"를 알려준다 - 관리 기능의 존재 자체를 드러내지 않는다. 일반적인 REST 관행과
 * 다르며 의도된 선택이다.
 *
 * <p>역할을 JWT 가 아니라 <b>DB 에서 읽는다</b> - 토큰에 담으면 강등이 만료까지 반영되지 않는다.
 */
@Service
public class AdminAccessGuard {

	private final UserMapper userMapper;

	public AdminAccessGuard(UserMapper userMapper) {
		this.userMapper = userMapper;
	}

	/** 관리자가 아니면 404. 메시지에도 관리 기능의 존재를 드러내지 않는다 */
	public void requireAdmin(UUID userId) {
		boolean admin = userMapper.findById(userId)
				.map(u -> "admin".equals(u.role()))
				.orElse(false);
		if (!admin) {
			throw new NotFoundException("찾을 수 없음");
		}
	}
}
