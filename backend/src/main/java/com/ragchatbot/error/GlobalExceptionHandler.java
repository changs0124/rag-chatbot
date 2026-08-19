package com.ragchatbot.error;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import jakarta.servlet.http.HttpServletRequest;

import com.ragchatbot.error.ApiExceptions.BadRequestException;
import com.ragchatbot.error.ApiExceptions.ConflictException;
import com.ragchatbot.error.ApiExceptions.NotFoundException;
import com.ragchatbot.error.ApiExceptions.RateLimitException;
import com.ragchatbot.error.ApiExceptions.UnauthorizedException;

/**
 * 예외 → 일관된 ApiError(JSON) 변환.
 *
 * <p>도메인 예외는 각각의 핸들러가, 그 밖의 예외는 {@link #handleUnexpected} 가 받음(FEAT-OPS-002).
 * 폴백이 없던 동안에는 예상 못 한 예외만 Spring 기본 형태({@code timestamp}·{@code status}·
 * {@code error}·{@code path})로 나가 <b>이 경로에서만 응답 계약이 깨졌고</b>, 프론트는 {@code message}
 * 를 못 찾아 "요청 실패 (500)" 만 띄웠음. 서버 로그에도 어느 요청이었는지 상관 지을 기록이 없었음.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	public record ApiError(String code, String message) {
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
		String msg = ex.getBindingResult().getFieldErrors().stream()
				.findFirst()
				.map(fe -> fe.getField() + " " + fe.getDefaultMessage())
				.orElse("잘못된 요청");
		return ResponseEntity.badRequest().body(new ApiError("BAD_REQUEST", msg));
	}

	@ExceptionHandler(ConflictException.class)
	public ResponseEntity<ApiError> handleConflict(ConflictException ex) {
		return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiError("CONFLICT", ex.getMessage()));
	}

	@ExceptionHandler(UnauthorizedException.class)
	public ResponseEntity<ApiError> handleUnauthorized(UnauthorizedException ex) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiError("UNAUTHORIZED", ex.getMessage()));
	}

	@ExceptionHandler(NotFoundException.class)
	public ResponseEntity<ApiError> handleNotFound(NotFoundException ex) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError("NOT_FOUND", ex.getMessage()));
	}

	@ExceptionHandler(BadRequestException.class)
	public ResponseEntity<ApiError> handleBadRequest(BadRequestException ex) {
		return ResponseEntity.badRequest().body(new ApiError("BAD_REQUEST", ex.getMessage()));
	}

	@ExceptionHandler(MaxUploadSizeExceededException.class)
	public ResponseEntity<ApiError> handleTooLarge(MaxUploadSizeExceededException ex) {
		return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
				.body(new ApiError("PAYLOAD_TOO_LARGE", "업로드 용량 한도 초과"));
	}

	@ExceptionHandler(RateLimitException.class)
	public ResponseEntity<ApiError> handleRateLimit(RateLimitException ex) {
		return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(new ApiError("RATE_LIMIT", ex.getMessage()));
	}

	/**
	 * 최종 폴백(FEAT-OPS-002). 위 핸들러에 걸리지 않은 예외만 여기로 옴 - 스프링이 더 구체적인
	 * 핸들러를 먼저 고르므로 400·404 가 500 으로 뭉개지지 않음.
	 *
	 * <p><b>예외 메시지를 응답에 싣지 않음.</b> SQL 조각·클래스 이름이 그대로 나가면 정보 노출임.
	 * 사용자에게 주는 것은 상관 ID 하나이고, 그 값으로 로그를 찾음 - 관측 도구를 붙이지 않고
	 * "오류가 났어요"를 서버 로그의 한 줄과 이어 붙일 수 있는 유일한 수단임.
	 *
	 * <p>SSE 스트림 도중의 오류는 여기 오지 않음. 응답이 이미 시작돼 상태 코드를 바꿀 수 없고,
	 * ChatService 가 {@code event: error} 로 따로 처리함.
	 */
	@ExceptionHandler(Exception.class)
	public ResponseEntity<ApiError> handleUnexpected(Exception ex, HttpServletRequest request) {
		// 8자리면 로그에서 찾기 충분하고 사용자가 읽어 옮기기도 부담이 없음(UUID 전체는 36자)
		String traceId = UUID.randomUUID().toString().substring(0, 8);
		log.error("처리되지 않은 예외 [{}] {} {}", traceId, request.getMethod(), request.getRequestURI(), ex);
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
				.body(new ApiError("INTERNAL_ERROR", "처리 중 오류가 발생했습니다 (오류 번호: " + traceId + ")"));
	}
}
