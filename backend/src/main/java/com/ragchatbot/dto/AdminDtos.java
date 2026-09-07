package com.ragchatbot.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 관리자 API 응답 DTO(FEAT-ADMIN-002 · 003).
 */
public final class AdminDtos {

	private AdminDtos() {
	}

	/**
	 * 문서 목록 항목. <b>이메일을 싣지 않음</b> - 관리 화면에 필요하지 않은 개인정보를 늘리지 않음.
	 *
	 * <p>{@code status} 는 {@code in_progress} · {@code completed} · {@code failed}.
	 * 화면은 실패에 <b>설명을 함께</b> 붙여야 함 - 아이콘만 두면 "올라갔으니 됐다"고 읽힘(REQ-ADMIN-003).
	 */
	public record DocumentResponse(UUID id, String filename, long byteSize, String status,
			String uploadedByName, OffsetDateTime createdAt) {
	}

	/** 사용자 목록 항목. 초기화 대상을 고르는 용도라 여기서는 이메일이 필요함 */
	public record AdminUserResponse(UUID id, String email, String name, String role,
			OffsetDateTime createdAt) {
	}

	/**
	 * 임시 비밀번호 발급 결과(FEAT-ADMIN-003). <b>이 값은 한 번만 반환되고 저장되지 않음.</b>
	 * 발급 즉시 대상 사용자의 기존 토큰이 전부 무효가 됨.
	 */
	public record TemporaryPasswordResponse(String temporaryPassword) {
	}
}
