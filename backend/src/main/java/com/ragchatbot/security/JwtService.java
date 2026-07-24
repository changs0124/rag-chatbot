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

	public JwtService(
			@Value("${app.jwt.secret:}") String secret,
			@Value("${app.jwt.expiration-minutes:120}") long expirationMinutes) {
		if (secret == null || secret.isBlank()) {
			throw new IllegalStateException("app.jwt.secret 미설정 - JWT 서명 불가 (env JWT_SECRET 주입 필요)");
		}
		this.algorithm = Algorithm.HMAC256(secret);
		this.verifier = JWT.require(algorithm).build();
		this.expirationMinutes = expirationMinutes;
	}

	public String issue(UUID userId, String email) {
		Instant now = Instant.now();
		return JWT.create()
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
