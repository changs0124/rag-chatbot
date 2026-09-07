package com.ragchatbot.exception;

import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.servlet.http.HttpServletRequest;

import com.ragchatbot.exception.ApiExceptions.BadRequestException;
import com.ragchatbot.exception.ApiExceptions.ConflictException;
import com.ragchatbot.exception.ApiExceptions.NotFoundException;
import com.ragchatbot.exception.ApiExceptions.RateLimitException;
import com.ragchatbot.exception.ApiExceptions.UnauthorizedException;

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
	 * 요청 본문을 읽지 못함 - 깨진 JSON · UTF-8 이 아닌 바이트 · 빈 본문이 전부 여기로 옴.
	 *
	 * <p><b>보낸 쪽 잘못이므로 400 이다.</b> 이 핸들러가 없으면 폴백이 받아 500 이 나가고, 그러면
	 * 상관 ID 만 남아 보내는 쪽은 무엇을 고쳐야 하는지 알 수 없다. 실제로 인코딩이 어긋난
	 * 클라이언트에서 이 경로를 밟았다(TC-OPS-014~016).
	 *
	 * <p>예외 메시지는 싣지 않음 - 파서 예외에는 본문 조각과 클래스 이름이 들어 있어
	 * {@link #handleUnexpected} 와 같은 이유로 노출 대상이 아님(TC-OPS-018).
	 */
	@ExceptionHandler(HttpMessageNotReadableException.class)
	public ResponseEntity<ApiError> handleUnreadableBody(HttpMessageNotReadableException ex) {
		log.warn("요청 본문을 읽지 못함: {}", ex.getMostSpecificCause().getMessage());
		return ResponseEntity.badRequest()
				.body(new ApiError("BAD_REQUEST", "요청 본문을 읽을 수 없음 (JSON 형식과 인코딩을 확인할 것)"));
	}

	/**
	 * 경로·쿼리 변수의 타입이 어긋남 - UUID 자리에 UUID 가 아닌 값이 온 경우 등.
	 *
	 * <p>없는 UUID(404)와 UUID 가 아닌 값(400)은 다른 사건이다. 변수 이름은 우리가 정의한 API 표면이라
	 * 밝혀도 새는 것이 없고, 밝혀야 어디를 고칠지 알 수 있다.
	 */
	@ExceptionHandler(MethodArgumentTypeMismatchException.class)
	public ResponseEntity<ApiError> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
		return ResponseEntity.badRequest()
				.body(new ApiError("BAD_REQUEST", "요청 값의 형식이 올바르지 않음: " + ex.getName()));
	}

	/**
	 * 없는 URL - 어느 라우트에도 걸리지 않음.
	 *
	 * <p>Spring Boot 3.2+ 는 정적 리소스 체인이 {@code NoResourceFoundException} 을 던짐
	 * ({@code NoHandlerFoundException} 이 아님 - 실측으로 확인함). 폴백에 맡기면 오타 난 URL 이
	 * 500 이 되어, 보낸 쪽은 자기 잘못이라는 사실조차 알 수 없었음.
	 *
	 * <p><b>경로를 응답에 싣지 않음.</b> 보낸 쪽이 이미 아는 값이라 실어도 얻는 것이 없고,
	 * 그대로 되돌려 주면 반사 출력 경로가 하나 생김.
	 */
	@ExceptionHandler(NoResourceFoundException.class)
	public ResponseEntity<ApiError> handleNoResource(NoResourceFoundException ex) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND)
				.body(new ApiError("NOT_FOUND", "요청한 경로가 없음"));
	}

	/**
	 * 라우트는 있으나 그 메서드를 받지 않음.
	 *
	 * <p><b>{@code Allow} 헤더를 함께 보냄.</b> RFC 9110 §15.5.6 이 405 응답에 이 헤더를 MUST 로
	 * 요구함 - 없으면 보낸 쪽은 무엇으로 다시 쳐야 하는지 알 수 없어 상태 코드가 반쪽이 됨.
	 * 값은 우리가 정의한 API 표면이라 밝혀도 새는 것이 없음(P-3 는 <i>리소스의 존재</i>를 가리는
	 * 원칙이고, 라우트 형태는 api.md 에 이미 공개돼 있음).
	 */
	@ExceptionHandler(HttpRequestMethodNotSupportedException.class)
	public ResponseEntity<ApiError> handleMethodNotAllowed(HttpRequestMethodNotSupportedException ex) {
		var builder = ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED);
		Set<HttpMethod> allowed = ex.getSupportedHttpMethods();
		if (allowed != null && !allowed.isEmpty()) {
			builder.allow(allowed.toArray(new HttpMethod[0]));
		}
		return builder.body(new ApiError("METHOD_NOT_ALLOWED", "이 경로가 받지 않는 메서드"));
	}

	/**
	 * Content-Type 이 그 라우트와 맞지 않음.
	 *
	 * <p><b>본문을 읽을 수 없는 것(400)과 다른 사건임.</b> 이쪽은 본문에 닿기 전 협상 단계에서
	 * 거절됨. 같은 400 으로 뭉뚱그리면 보낸 쪽은 JSON 문법을 고쳐야 하는지 헤더를 고쳐야 하는지
	 * 구분할 수 없음.
	 */
	@ExceptionHandler(HttpMediaTypeNotSupportedException.class)
	public ResponseEntity<ApiError> handleUnsupportedMediaType(HttpMediaTypeNotSupportedException ex) {
		return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
				.body(new ApiError("UNSUPPORTED_MEDIA_TYPE", "지원하지 않는 Content-Type"));
	}

	/**
	 * 최종 폴백(FEAT-OPS-002). 위 핸들러에 걸리지 않은 예외만 여기로 옴 - 스프링이 더 구체적인
	 * 핸들러를 먼저 고르므로 400·404 가 500 으로 뭉개지지 않음.
	 *
	 * <p><b>그 보장은 핸들러가 있는 예외에만 성립함.</b> 핸들러가 없으면 그것이 요청 잘못이든
	 * 서버 잘못이든 전부 여기로 와서 500 이 됨 - 실제로 {@code HttpMessageNotReadableException} 이
	 * 그렇게 새어 깨진 JSON 이 500 으로 나갔음(#38). 라우팅 단계 셋(없는 URL · 405 · 415)도 같은
	 * 이유로 새고 있었음(#45). 요청 잘못으로 분류되는 예외를 새로 발견하면 폴백에 맡기지 말고
	 * 위에 핸들러를 추가할 것.</p>
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
