package com.ragchatbot.security;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * JWT 서명 시크릿의 최소 길이 강제 (보안 리뷰 F1).
 *
 * <p><b>왜 필요한가</b> : {@code backend/.env.example} 은 「32바이트 이상」을 안내해 왔지만
 * 그것을 확인하는 코드가 없어 <b>4글자 시크릿으로도 정상 기동했고 경고도 없었다.</b>
 * 같은 시크릿이 인증 토큰(aud=auth)과 파일 접근 토큰(aud=file)을 함께 서명하고,
 * {@code /api/files/**} 는 permitAll 이라 그 서명이 유일한 경계다.
 *
 * <p>DB 를 띄우지 않고 확인되는 부분이라 단위 테스트로 둔다. 실제 기동이 막히는지는
 * {@link JwtSecretLengthContextTest} 가 컨텍스트를 띄워 본다.
 */
class JwtSecretPolicyTest {

	/** 미설정 - 종전 동작이 그대로 유지되는지 (길이 검사를 넣으며 앞 분기를 잃지 않았는지) */
	@Test
	void null_secret_is_rejected() {
		assertThatThrownBy(() -> JwtSecretPolicy.require(null, "JWT 서명 불가"))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("미설정")
				.hasMessageContaining("JWT_SECRET");
	}

	@Test
	void blank_secret_is_rejected() {
		assertThatThrownBy(() -> JwtSecretPolicy.require("   ", "JWT 서명 불가"))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("미설정");
	}

	/**
	 * 이 이슈의 핵심 - 값이 있어도 짧으면 막는다.
	 *
	 * <p>메시지가 <b>실제 길이와 요구 길이를 함께</b> 밝히는지도 본다. 그것이 없으면
	 * 배포자가 "얼마나 더 늘려야 하는지" 를 모른 채 다시 시도하게 된다.
	 */
	@Test
	void short_secret_is_rejected_with_actionable_message() {
		assertThatThrownBy(() -> JwtSecretPolicy.require("too-short", "JWT 서명 불가"))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("9")
				.hasMessageContaining("32")
				.hasMessageContaining("openssl rand");
	}

	/** 경계 - 31바이트는 막고 32바이트는 통과한다. 한쪽만 두면 off-by-one 이 살아남는다 */
	@Test
	void boundary_is_exactly_min_bytes() {
		String justUnder = "a".repeat(JwtSecretPolicy.MIN_BYTES - 1);
		String exact = "a".repeat(JwtSecretPolicy.MIN_BYTES);

		assertThatThrownBy(() -> JwtSecretPolicy.require(justUnder, "JWT 서명 불가"))
				.isInstanceOf(IllegalStateException.class);
		assertThatCode(() -> JwtSecretPolicy.require(exact, "JWT 서명 불가"))
				.doesNotThrowAnyException();
	}

	/**
	 * 길이는 <b>문자 수가 아니라 UTF-8 바이트 수</b>로 잰다.
	 *
	 * <p>한글 11자는 33바이트라 통과하고, 10자는 30바이트라 막힌다. 문자 수로 세면
	 * 한글 시크릿이 실제보다 강해 보이는 반대 방향 오류가 아니라 - 여기서는 <b>약해 보이는</b>
	 * 쪽이지만, 어느 쪽이든 서명 강도를 결정하는 것은 바이트다.
	 */
	@Test
	void length_is_measured_in_utf8_bytes() {
		assertThatCode(() -> JwtSecretPolicy.require("가".repeat(11), "JWT 서명 불가"))
				.doesNotThrowAnyException();
		assertThatThrownBy(() -> JwtSecretPolicy.require("가".repeat(10), "JWT 서명 불가"))
				.isInstanceOf(IllegalStateException.class);
	}

	/** 용도 문구가 메시지에 실린다 - 두 서명 경로 중 어느 쪽이 막혔는지 로그에서 갈려야 한다 */
	@Test
	void purpose_is_carried_into_message() {
		assertThatThrownBy(() -> JwtSecretPolicy.require("short", "파일 토큰 서명 불가"))
				.hasMessageContaining("파일 토큰 서명 불가");
	}
}
