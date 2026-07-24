package com.ragchatbot.error;

/**
 * 도메인 예외 모음. GlobalExceptionHandler가 HTTP 상태로 변환함.
 * P-3 : 소유권 위반은 403이 아니라 NotFoundException(404)으로 존재를 은닉함.
 */
public final class ApiExceptions {

	private ApiExceptions() {
	}

	/** 404 - 리소스 없음(또는 소유권 위반 은닉) */
	public static class NotFoundException extends RuntimeException {
		public NotFoundException(String message) {
			super(message);
		}
	}

	/** 409 - 중복(이메일 등) */
	public static class ConflictException extends RuntimeException {
		public ConflictException(String message) {
			super(message);
		}
	}

	/** 401 - 인증 실패(자격 증명 불일치 등) */
	public static class UnauthorizedException extends RuntimeException {
		public UnauthorizedException(String message) {
			super(message);
		}
	}
}
