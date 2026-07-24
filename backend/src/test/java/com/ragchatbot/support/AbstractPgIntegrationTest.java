package com.ragchatbot.support;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * 통합 테스트 공통 베이스 - 실 PostgreSQL(Testcontainers) + 회원가입 헬퍼. Docker 필요.
 * 싱글턴 컨테이너 패턴 : 컨테이너를 static으로 1회만 시작해 모든 테스트 클래스가 공유함.
 * (@Container 를 클래스마다 쓰면 한 클래스 종료 시 컨테이너가 멈춰 캐시된 컨텍스트가 죽음)
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
		"app.jwt.secret=test-secret-please-change-0123456789abcdef",
		"app.ratelimit.chat-per-minute=5" })
public abstract class AbstractPgIntegrationTest {

	static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

	static {
		POSTGRES.start(); // Ryuk가 JVM 종료 시 정리. 재시작/중단 없음
	}

	@DynamicPropertySource
	static void datasourceProps(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::getUsername);
		registry.add("spring.datasource.password", POSTGRES::getPassword);
	}

	@Autowired
	protected TestRestTemplate rest;

	@Autowired
	protected JdbcTemplate jdbc;

	/** 회원가입 후 JWT 반환 */
	@SuppressWarnings("rawtypes")
	protected String signup(String email) {
		var res = rest.postForEntity("/api/auth/signup",
				Map.of("email", email, "password", "password123", "name", "사용자"), Map.class);
		return (String) res.getBody().get("token");
	}

	protected HttpHeaders bearer(String token) {
		var h = new HttpHeaders();
		h.setBearerAuth(token);
		return h;
	}
}
