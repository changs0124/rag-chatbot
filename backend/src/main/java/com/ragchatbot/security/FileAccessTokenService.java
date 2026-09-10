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
 * 파일 서빙용 서명 경로 토큰(M6/AC-22).
 * stateless JWT 하에서 <img src>는 Authorization 헤더를 못 실으므로,
 * 파일 URL에 짧은 만료의 서명 토큰(subject=fileId, claim=userId)을 실어 검증함.
 */
@Service
public class FileAccessTokenService {

	private final Algorithm algorithm;
	private final JWTVerifier verifier;
	private final long ttlMinutes;

	public FileAccessTokenService(
			@Value("${app.jwt.secret:}") String secret,
			@Value("${app.file.access-token-ttl-minutes:15}") long ttlMinutes) {
		JwtSecretPolicy.require(secret, "파일 토큰 서명 불가");
		this.algorithm = Algorithm.HMAC256(secret);
		this.verifier = JWT.require(algorithm).withAudience("file").build();
		this.ttlMinutes = ttlMinutes;
	}

	public String issue(UUID fileId, UUID userId) {
		Instant now = Instant.now();
		return JWT.create()
				.withAudience("file")
				.withSubject(fileId.toString())
				.withClaim("uid", userId.toString())
				.withIssuedAt(now)
				.withExpiresAt(now.plus(ttlMinutes, ChronoUnit.MINUTES))
				.sign(algorithm);
	}

	/** 검증 실패 시 예외. fileId 일치까지 확인함 */
	public UUID verifyAndGetUserId(String token, UUID expectedFileId) {
		DecodedJWT jwt = verifier.verify(token);
		if (!jwt.getSubject().equals(expectedFileId.toString())) {
			throw new IllegalArgumentException("파일 토큰 대상 불일치");
		}
		return UUID.fromString(jwt.getClaim("uid").asString());
	}
}
