package com.ragchatbot.security;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTVerifier;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;

/**
 * JWT 발급/검증 (HS256, java-jwt 4.6.0). subject=userId, claim=email.
 * 시크릿은 app.jwt.secret(env 주입). 비어 있으면 기동 시 실패시킴(운영 안전).
 */
@Service
public class JwtService {

	private final Algorithm algorithm;
	private final JWTVerifier verifier;
	private final long expirationMinutes;
	private final long refreshThresholdMinutes;

	public JwtService(
			@Value("${app.jwt.secret:}") String secret,
			@Value("${app.jwt.expiration-minutes:120}") long expirationMinutes,
			@Value("${app.jwt.refresh-threshold-minutes:30}") long refreshThresholdMinutes) {
		JwtSecretPolicy.require(secret, "JWT 서명 불가");
		this.algorithm = Algorithm.HMAC256(secret);
		// audience "auth" 강제 - 파일 서명 토큰(aud="file")이 인증 Bearer로 통용되지 않게 분리
		this.verifier = JWT.require(algorithm).withAudience("auth").build();
		this.expirationMinutes = expirationMinutes;
		this.refreshThresholdMinutes = refreshThresholdMinutes;
	}

	/**
	 * 남은 수명이 임계 미만인지(FEAT-OPS-003). 매 요청 재발급하면 서명 연산이 요청마다 붙고 헤더가
	 * 늘 커지므로, 만료가 가까울 때만 함 - 실제 발급은 사용자당 임계 간격에 한 번꼴이 됨.
	 *
	 * <p>임계가 {@code 0} 이면 언제나 false - 종전 고정 만료 동작으로 되돌리는 경로임.
	 */
	public boolean needsRefresh(DecodedJWT jwt) {
		if (refreshThresholdMinutes <= 0) {
			return false;
		}
		Instant expiresAt = jwt.getExpiresAtAsInstant();
		if (expiresAt == null) {
			return false;
		}
		return expiresAt.isBefore(Instant.now().plus(refreshThresholdMinutes, ChronoUnit.MINUTES));
	}

	public String issue(UUID userId, String email) {
		Instant now = Instant.now();
		return JWT.create()
				.withAudience("auth")
				.withSubject(userId.toString())
				.withClaim("email", email)
				.withIssuedAt(now)
				.withExpiresAt(now.plus(expirationMinutes, ChronoUnit.MINUTES))
				.sign(algorithm);
	}

	/** 검증 실패(위조·만료·서명 불일치) 시 JWTVerificationException 발생 */
	public DecodedJWT verify(String token) {
		return verifier.verify(token);
	}
}
