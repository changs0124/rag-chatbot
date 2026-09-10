package com.ragchatbot.security;

import java.nio.charset.StandardCharsets;

/**
 * JWT 서명 시크릿의 최소 요건 검사. 기동 시 한 번만 돌며, 못 미치면 예외로 기동을 막음
 * ({@code AppModeGuard} · {@code EmailDomainPolicy} 와 같은 fail-fast).
 *
 * <p><b>한 곳에 둔 이유</b> - 같은 시크릿을 {@link JwtService}(aud=auth)와
 * {@link FileAccessTokenService}(aud=file) 두 곳이 서명에 쓴다. 하한을 각자 들고 있으면
 * 한쪽만 올렸을 때 둘이 조용히 갈리는데, <b>약한 쪽이 곧 전체의 실효 강도</b>다 -
 * 두 토큰이 같은 키로 서명되므로 어느 쪽을 깨든 나머지 하나도 함께 위조된다.
 *
 * <p><b>32바이트인 이유</b> - HS256 의 HMAC 블록이 256비트다. 그보다 짧은 시크릿은 키 공간이
 * 해시 출력보다 작아, 토큰 하나만 있으면 오프라인에서 시크릿 자체를 되찾는 쪽이 더 싸진다.
 * 특히 {@code /api/files/**} 는 {@code permitAll} 이라(SecurityConfig) 파일 토큰의 서명이
 * 그 경로의 <b>유일한</b> 경계다.
 */
final class JwtSecretPolicy {

	/** HS256 블록 크기와 같은 값. 바이트 수로 재며, 멀티바이트 문자는 UTF-8 인코딩 길이로 셈 */
	static final int MIN_BYTES = 32;

	private JwtSecretPolicy() {
	}

	/**
	 * 시크릿이 서명에 쓰기에 충분한지 확인함. 미달이면 {@link IllegalStateException} 을 던져
	 * ApplicationContext 기동을 실패시킴.
	 *
	 * @param secret  {@code app.jwt.secret} 로 주입된 값
	 * @param purpose 실패 메시지에 실을 용도(어느 서명이 불가능한지 밝히기 위함)
	 */
	static void require(String secret, String purpose) {
		if (secret == null || secret.isBlank()) {
			throw new IllegalStateException(
					"app.jwt.secret 미설정 - " + purpose + " (env JWT_SECRET 주입 필요)");
		}
		int bytes = secret.getBytes(StandardCharsets.UTF_8).length;
		if (bytes < MIN_BYTES) {
			throw new IllegalStateException(
					"app.jwt.secret 이 너무 짧음 - " + bytes + "바이트이며 최소 " + MIN_BYTES + "바이트가 필요함("
							+ purpose + "). 짧은 시크릿은 토큰 하나로 오프라인 복원이 가능하고, "
							+ "같은 키가 파일 접근 토큰도 서명하므로 첨부까지 함께 열림. "
							+ "생성 예 : openssl rand -base64 48");
		}
	}
}
