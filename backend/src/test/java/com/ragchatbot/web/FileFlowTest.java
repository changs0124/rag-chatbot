package com.ragchatbot.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;

import com.ragchatbot.service.FileService;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * Phase 3 파일 플로우 : 업로드·검증(AC-11)·서명 서빙(AC-22)·고아 정리(AC-13).
 */
class FileFlowTest extends AbstractPgIntegrationTest {

	@Autowired
	private FileService fileService;

	// 유효 PNG 매직바이트(89 50 4E 47 0D 0A 1A 0A) + 패딩
	private static final byte[] PNG = { (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0 };

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private org.springframework.http.ResponseEntity<Map> upload(String token, byte[] content, MediaType partType,
			String filename) {
		var partHeaders = new HttpHeaders();
		partHeaders.setContentType(partType);
		var resource = new ByteArrayResource(content) {
			@Override
			public String getFilename() {
				return filename;
			}
		};
		var body = new LinkedMultiValueMap<String, Object>();
		body.add("file", new HttpEntity<>(resource, partHeaders));

		var headers = bearer(token);
		headers.setContentType(MediaType.MULTIPART_FORM_DATA);
		return rest.postForEntity("/api/files", new HttpEntity<>(body, headers), Map.class);
	}

	@Test
	void upload_valid_png_then_serve_ok() {
		String token = signup("file1@b.com");
		var res = upload(token, PNG, MediaType.IMAGE_PNG, "a.png");
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody().get("fileType")).isEqualTo("image");
		String url = (String) res.getBody().get("url");
		assertThat(url).contains("/api/files/").contains("token=");

		// 서명 URL로 서빙(비인증 헤더로도 접근 - 토큰이 게이트)
		var served = rest.getForEntity(url, byte[].class);
		assertThat(served.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(served.getBody()).isEqualTo(PNG);
	}

	@Test
	void serve_without_token_404() {
		String token = signup("file2@b.com");
		String url = (String) upload(token, PNG, MediaType.IMAGE_PNG, "a.png").getBody().get("url");
		String idOnly = url.substring(0, url.indexOf('?')); // 토큰 제거
		var res = rest.getForEntity(idOnly, Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	@Test
	void serve_with_tampered_token_404() {
		String token = signup("file3@b.com");
		String url = (String) upload(token, PNG, MediaType.IMAGE_PNG, "a.png").getBody().get("url");
		var res = rest.getForEntity(url + "tampered", Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	@Test
	void upload_bad_magic_400() {
		String token = signup("file4@b.com");
		byte[] notPng = { 0x00, 0x01, 0x02, 0x03, 0x04 };
		var res = upload(token, notPng, MediaType.IMAGE_PNG, "a.png");
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}

	@Test
	void upload_unsupported_type_400() {
		String token = signup("file5@b.com");
		var res = upload(token, "hello".getBytes(), MediaType.TEXT_PLAIN, "a.txt");
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}

	@Test
	void delete_own_then_gone() {
		String token = signup("file6@b.com");
		var up = upload(token, PNG, MediaType.IMAGE_PNG, "a.png");
		String url = (String) up.getBody().get("url");
		String id = url.substring(url.indexOf("/api/files/") + 11, url.indexOf('?'));

		var del = rest.exchange("/api/files/" + id, HttpMethod.DELETE, new HttpEntity<>(bearer(token)), Void.class);
		assertThat(del.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

		var served = rest.getForEntity(url, Map.class);
		assertThat(served.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	@Test
	void orphan_cleanup_removes_unlinked() {
		String token = signup("file7@b.com");
		String url = (String) upload(token, PNG, MediaType.IMAGE_PNG, "a.png").getBody().get("url");

		int removed = fileService.cleanupOrphans(OffsetDateTime.now().plusMinutes(1));
		assertThat(removed).isGreaterThanOrEqualTo(1);

		var served = rest.getForEntity(url, Map.class);
		assertThat(served.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}
}
