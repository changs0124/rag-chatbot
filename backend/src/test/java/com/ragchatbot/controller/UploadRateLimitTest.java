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
 * <p><b>흔들림의 원인이 둘이고 서로 다르다(#176).</b> 하나를 막았다고 다른 하나가 사라지지 않는다.
 *
 * <ul>
 * <li><b>동시 요청 타이밍</b> — 요청을 실제로 병렬로 띄우면 순서에 기대게 된다.
 * <b>상한을 낮게 두어</b> 순차 호출만으로 상한을 넘기게 만들어 막는다
 * ({@code ChatBackPressureTest} 와 같은 수법).</li>
 * <li><b>고정 윈도우 경계</b> — {@code RateLimiterService} 는 분이 바뀌면 카운터를 0 으로 새로
 * 시작한다. 경계가 요청들 사이에 끼면 거절이 한 건도 안 나온다. <b>상한을 낮추는 것으로는 이쪽이
 * 사라지지 않는다</b> — 2026-09-12 에 상한 2 · 요청 3번 구성이 실제로 이것 때문에 깨졌다.</li>
 * </ul>
 *
 * <p><b>경계 쪽은 「상한의 두 배 넘게 보내기」로 막는다</b>({@code docs/CONVENTIONS.md} 「테스트·CI
 * 게이트」). 상한을 <b>1</b> 로 두고 <b>3번</b> 보내면 경계가 어디에 끼어도 거절이 최소 한 건 남는다 —
 * 두 창에 {@code (k, 3-k)} 로 쪼개질 때 거절 수가 {@code max(0,k-1) + max(0,(3-k)-1)} 이고
 * 네 경우 모두 1 이상이다. 상한 2 · 요청 5번도 같은 효과지만, 비밀번호 변경은 호출당 BCrypt 가
 * 두 번 돌아 <b>요청을 늘리는 쪽이 더 비싸다.</b>
 *
 * <p><b>단언은 두 방향으로 유지한다</b> — 「첫 요청은 통과」와 「어딘가에서 429」를 함께 본다.
 * 뒤만 보면 <b>무조건 거절하는 구현</b>이 통과하고, 「정확히 N번째가 429」를 보면 경계에 다시 흔들린다.
 */
@TestPropertySource(properties = {
		"app.ratelimit.upload-per-minute=1",
		"app.ratelimit.password-change-per-minute=1" })
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

	/**
	 * 같은 호출을 {@code times} 번 보내고 상태 코드를 순서대로 모은다(#176).
	 *
	 * <p>호출 지점에서 「첫 요청은 통과」와 「어딘가에서 429」를 따로 단언하기 위한 것이다.
	 * 몇 번째가 429 인지는 고정 윈도우 경계 때문에 정해지지 않으므로 단언하지 않는다.
	 */
	private static java.util.List<HttpStatus> repeat(int times, java.util.function.Supplier<HttpStatus> call) {
		java.util.List<HttpStatus> out = new java.util.ArrayList<>(times);
		for (int i = 0; i < times; i++) {
			out.add(call.get());
		}
		return out;
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

		var codes = repeat(3, () -> upload(token));

		assertThat(codes.get(0))
				.withFailMessage("첫 업로드가 막힘 - 상한 안의 요청까지 거절하는 구현이다 (관측: %s)", codes)
				.isEqualTo(HttpStatus.OK);
		assertThat(codes)
				.withFailMessage("세 번 중 429 가 한 번도 없음 - 업로드에 유량 상한이 없다는 뜻 (관측: %s)", codes)
				.contains(HttpStatus.TOO_MANY_REQUESTS);
	}

	/** 상한은 사용자별이다 - 남의 업로드가 내 한도를 먹으면 한 사람이 전체를 막을 수 있다 */
	@Test
	void upload_limit_is_per_user() {
		String a = createUser("upload-a@b.com");
		String b = createUser("upload-b@b.com");

		var codesA = repeat(3, () -> upload(a));

		assertThat(codesA)
				.withFailMessage("a 가 상한에 걸리지 않음 - 이 검사의 전제가 성립하지 않는다 (관측: %s)", codesA)
				.contains(HttpStatus.TOO_MANY_REQUESTS);
		assertThat(upload(b))
				.withFailMessage("a 가 상한을 넘겼는데 b 도 막힘 - 한 사람이 전체를 막을 수 있다는 뜻")
				.isEqualTo(HttpStatus.OK);
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

		var codes = repeat(3, () -> changePassword(token, "wrong"));

		assertThat(codes.get(0))
				.withFailMessage("첫 시도가 401 이 아님 - 상한 안의 요청까지 거절하는 구현이다 (관측: %s)", codes)
				.isEqualTo(HttpStatus.UNAUTHORIZED);
		assertThat(codes)
				.withFailMessage("세 번 중 429 가 한 번도 없음 - BCrypt 를 무한히 돌릴 수 있다는 뜻 (관측: %s)", codes)
				.contains(HttpStatus.TOO_MANY_REQUESTS);
	}
}
