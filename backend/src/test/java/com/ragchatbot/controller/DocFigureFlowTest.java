package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 문서 그림 서빙(FEAT-CHAT-004 · API-GET-009). 목업 모드 + 루트 미설정이라 classpath 견본을 쓴다.
 * 루트 디렉터리·live 분기는 {@code DocFigureServiceTest} 가 본다.
 */
class DocFigureFlowTest extends AbstractPgIntegrationTest {

	private org.springframework.http.ResponseEntity<byte[]> get(String token, String key) {
		var headers = token == null ? new org.springframework.http.HttpHeaders() : bearer(token);
		return rest.exchange("/api/doc-figures/" + key, HttpMethod.GET, new HttpEntity<>(headers), byte[].class);
	}

	@Test
	void serves_mock_sample_to_logged_in_user() {
		var res = get(createUser("fig1@b.com"), "mock-sample");
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getHeaders().getContentType()).isEqualTo(MediaType.IMAGE_PNG);
		assertThat(res.getHeaders().getCacheControl()).contains("private");
		// PNG 매직바이트 - 견본 파일이 실제로 실렸는지
		assertThat(res.getBody()).startsWith((byte) 0x89, (byte) 0x50, (byte) 0x4E, (byte) 0x47);
	}

	@Test
	void anonymous_is_401() {
		// 첨부(/api/files)와 달리 permitAll 이 아니다 - 그림을 Bearer 로 받는 계약이 깨지면 여기서 드러난다
		assertThat(get(null, "mock-sample").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void unknown_key_is_404() {
		assertThat(get(createUser("fig2@b.com"), "tm-p999-f1").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	@Test
	void malformed_key_is_404_not_400() {
		String token = createUser("fig3@b.com");
		// 대문자 · 밑줄 · 65자 - 형식 오류도 「없음」으로 답한다
		assertThat(get(token, "Mock-Sample").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(get(token, "mock_sample").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(get(token, "a".repeat(65)).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}
}
