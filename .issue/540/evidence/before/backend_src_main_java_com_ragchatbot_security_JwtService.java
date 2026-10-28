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
 * JWT 발급/검증 (HS256, java-jwt). subject=userId 뿐이고 개인정보 클레임은 싣지 않음(#328).
 * 시크릿은 app.jwt.secret(env 주입). 비어 있으면 기동 시 실패시킴(운영 안전).
 *
 * <p>{@code auth_time} 은 최초 인증(로그인 · 비밀번호 변경) 시각이다. 재발급본은 이 값을 그대로 옮겨, 그로부터
 * {@code app.jwt.max-session-hours} 가 지나면 더 재발급하지 않는다(#403) - 새로 세면 탈취한 토큰이 무기한 이어진다.
 */
@Service
public class JwtService {

	private static final String AUTH_TIME = "auth_time";

	private final Algorithm algorithm;
	private final JWTVerifier verifier;
	private final long expirationMinutes;
	private final long refreshThresholdMinutes;
	private final long maxSessionHours;

	public JwtService(
			@Value("${app.jwt.secret}") String secret,
			@Value("${app.jwt.expiration-minutes}") long expirationMinutes,
			@Value("${app.jwt.refresh-threshold-minutes}") long refreshThresholdMinutes,
			@Value("${app.jwt.max-session-hours}") long maxSessionHours) {
		JwtSecretPolicy.require(secret, "JWT 서명 불가");
		this.algorithm = Algorithm.HMAC256(secret);
		// audience "auth" 강제 - 파일 서명 토큰(aud="file")이 인증 Bearer로 통용되지 않게 분리
		this.verifier = JWT.require(algorithm).withAudience("auth").build();
		this.expirationMinutes = expirationMinutes;
		this.refreshThresholdMinutes = refreshThresholdMinutes;
		this.maxSessionHours = maxSessionHours;
	}

	/**
	 * 남은 수명이 임계 미만인지(FEAT-OPS-003). 매 요청 재발급하면 서명 연산이 요청마다 붙고 헤더가
	 * 늘 커지므로, 만료가 가까울 때만 함 - 실제 발급은 사용자당 임계 간격에 한 번꼴이 됨.
	 *
	 * <p>임계가 {@code 0} 이면 언제나 false - 고정 만료로 동작함(재발급 끔).
	 */
	public boolean needsRefresh(DecodedJWT jwt) {
		if (refreshThresholdMinutes <= 0) {
			return false;
		}
		Instant expiresAt = jwt.getExpiresAtAsInstant();
		if (expiresAt == null) {
			return false;
		}
		Instant now = Instant.now();
		// 절대 수명(#403)이 지났으면 재발급하지 않는다 - 지금 토큰이 만료되면 재로그인이다
		if (!authTime(jwt).plus(maxSessionHours, ChronoUnit.HOURS).isAfter(now)) {
			return false;
		}
		return expiresAt.isBefore(now.plus(refreshThresholdMinutes, ChronoUnit.MINUTES));
	}

	/** 새 인증(로그인 · 비밀번호 변경) - 인증 시각은 지금 */
	public String issue(UUID userId) {
		return sign(userId.toString(), Instant.now());
	}

	/** 슬라이딩 재발급 - 인증 시각을 그대로 옮긴다(#403) */
	public String refresh(DecodedJWT jwt) {
		return sign(jwt.getSubject(), authTime(jwt));
	}

	private String sign(String subject, Instant authTime) {
		Instant now = Instant.now();
		return JWT.create()
				.withAudience("auth")
				.withSubject(subject)
				.withIssuedAt(now)
				.withExpiresAt(now.plus(expirationMinutes, ChronoUnit.MINUTES))
				.withClaim(AUTH_TIME, authTime.getEpochSecond())
				.sign(algorithm);
	}

	/**
	 * auth_time 이 없는 옛 토큰은 iat 를 인증 시각으로 본다 - 배포 순간 나가 있는 토큰이 한꺼번에 재발급을 잃으면
	 * 활동 중인 사용자 전원이 두 시간 안에 로그아웃된다. 검증을 통과한 토큰이라 iat 는 늘 있다
	 */
	private static Instant authTime(DecodedJWT jwt) {
		Long epoch = jwt.getClaim(AUTH_TIME).asLong();
		return epoch != null ? Instant.ofEpochSecond(epoch) : jwt.getIssuedAtAsInstant();
	}

	/** 검증 실패(위조·만료·서명 불일치) 시 JWTVerificationException 발생 */
	public DecodedJWT verify(String token) {
		return verifier.verify(token);
	}
}
