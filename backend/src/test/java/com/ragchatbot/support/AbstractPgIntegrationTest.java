package com.ragchatbot.support;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * 통합 테스트 공통 베이스 - 실 PostgreSQL(Testcontainers) + 회원가입 헬퍼. Docker 필요.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@Testcontainers
@TestPropertySource(properties = "app.jwt.secret=test-secret-please-change-0123456789abcdef")
public abstract class AbstractPgIntegrationTest {

	@Container
	@ServiceConnection
	static PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired
	protected TestRestTemplate rest;

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
