package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.core.io.ByteArrayResource;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 첨부 업로드와 비밀번호 변경에 사용자별 분당 상한이 걸리는지 (#95).
 *
 * <p><b>왜 필요한가</b> — 종전에는 {@code RateLimiterService} 를 부르는 곳이 채팅과 로그인뿐이었다.
 * 업로드는 {@code MultipartFile.getBytes()} 로 파일 전체를 힙에 올리므로, 26MB 요청을 병렬로 퍼부으면
 * Tomcat 기본 200 스레드 × 26MB ≈ 5GB 로 단일 인스턴스가 OOM 된다. 그리고 compose 에서
 * {@code uploads} 와 {@code pgdata} 가 같은 호스트 파일시스템이라 <b>디스크가 차면 Postgres 가 먼저
 * 멎는다</b> — 자체 호스팅 단일 서버라 복구가 사람 손이다.
 *
 * <p>비밀번호 변경은 매 호출이 BCrypt 를 두 번 돈다(현재 비밀번호 검증 + 새 해시). 현재 비밀번호를
 * 일부러 틀려도 검증은 돈다.
 *
 * <p><b>상한을 낮게 두어 결정적으로 만든다</b> — 동시 요청을 실제로 띄우면 타이밍에 기대게 되고,
 * 그런 테스트는 CI 에서 흔들린다({@code ChatBackPressureTest} 와 같은 수법).
 */
@TestPropertySource(properties = {
		"app.ratelimit.upload-per-minute=2",
		"app.ratelimit.password-change-per-minute=2" })
class UploadRateLimitTest extends AbstractPgIntegrationTest {

	/** 앞 4바이트가 PNG 매직인 최소 파일 - 매직바이트 검사를 통과하되 내용은 중요하지 않다 */
	private static final byte[] PNG = { (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

	@SuppressWarnings("rawtypes")
	private HttpStatus upload(String token) {
		HttpHeaders headers = bearer(token);
		headers.setContentType(MediaType.MULTIPART_FORM_DATA);
		MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
		body.add("file", new ByteArrayResource(PNG) {
			@Override
			public String getFilename() {
				return "a.png";
			}
		});
		var res = rest.exchange("/api/files", HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);
		return HttpStatus.valueOf(res.getStatusCode().value());
	}

	@SuppressWarnings("rawtypes")
	private HttpStatus changePassword(String token, String current) {
		var res = rest.exchange("/api/profile/password", HttpMethod.PATCH,
				new HttpEntity<>(Map.of("currentPassword", current, "newPassword", "NewPass123!"), bearer(token)),
				Map.class);
		return HttpStatus.valueOf(res.getStatusCode().value());
	}

	/**
	 * 상한을 넘긴 업로드가 429 로 거절된다.
	 *
	 * <p>상한 안의 요청은 통과해야 한다 - 그것까지 막히면 「무조건 거절하는 구현」이 통과한다.
	 */
	@Test
	void upload_over_the_limit_is_rejected() {
		String token = createUser("upload-limit@b.com");

		assertThat(upload(token)).isEqualTo(HttpStatus.OK);
		assertThat(upload(token)).isEqualTo(HttpStatus.OK);
		assertThat(upload(token))
				.withFailMessage("세 번째 업로드가 막히지 않음 - 업로드에 유량 상한이 없다는 뜻")
				.isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
	}

	/** 상한은 사용자별이다 - 남의 업로드가 내 한도를 먹으면 한 사람이 전체를 막을 수 있다 */
	@Test
	void upload_limit_is_per_user() {
		String a = createUser("upload-a@b.com");
		String b = createUser("upload-b@b.com");

		upload(a);
		upload(a);
		assertThat(upload(a)).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
		assertThat(upload(b)).isEqualTo(HttpStatus.OK);
	}

	/**
	 * 비밀번호 변경도 상한 안에 있다.
	 *
	 * <p>틀린 현재 비밀번호로 부른다 - 401 이 나가지만 <b>BCrypt 검증은 이미 돌았다.</b>
	 * 그 비용을 막는 것이 이 상한의 목적이므로, 실패한 시도도 세어야 한다.
	 */
	@Test
	void password_change_over_the_limit_is_rejected() {
		String token = createUser("pw-limit@b.com");

		assertThat(changePassword(token, "wrong-1")).isEqualTo(HttpStatus.UNAUTHORIZED);
		assertThat(changePassword(token, "wrong-2")).isEqualTo(HttpStatus.UNAUTHORIZED);
		assertThat(changePassword(token, "wrong-3"))
				.withFailMessage("세 번째 시도가 막히지 않음 - BCrypt 를 무한히 돌릴 수 있다는 뜻")
				.isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
	}
}
