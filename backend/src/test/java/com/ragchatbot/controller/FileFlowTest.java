package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;

import com.ragchatbot.security.FileAccessTokenService;
import com.ragchatbot.service.FileService;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * Phase 3 파일 플로우 : 업로드·검증(AC-11)·서명 서빙(AC-22)·고아 정리(AC-13).
 */
class FileFlowTest extends AbstractPgIntegrationTest {

	@Autowired
	private FileService fileService;

	@Autowired
	private FileAccessTokenService fileTokenService;

	@Autowired
	private com.ragchatbot.storage.FileStorage fileStorage;

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

	/**
	 * AC-11 용량 상한(이미지 10MB). MIME·매직바이트가 전부 맞아도 크기만으로 거부돼야 함 -
	 * 종전에는 이 경로에 케이스가 없어 상한을 지워도 초록이었음(2026-07-28 리스크 표 정비).
	 */
	@Test
	void upload_oversized_image_400() {
		String token = signup("file10@b.com");
		byte[] oversized = new byte[11 * 1024 * 1024]; // 상한 10MB 초과
		System.arraycopy(PNG, 0, oversized, 0, PNG.length); // 매직바이트는 유효하게 둠
		var res = upload(token, oversized, MediaType.IMAGE_PNG, "big.png");
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(String.valueOf(res.getBody())).contains("용량 초과");
	}

	/**
	 * R-10 소유자 검증 - 서명이 유효해도 <b>남의 파일</b>이면 404.
	 *
	 * <p>무토큰·변조 케이스는 서명 검증만 재고, 소유자 대조({@code findByIdAndUser})는 재지 않았음.
	 * B의 uid 로 정상 서명한 토큰을 A의 파일에 씌워, 서명이 통과한 뒤의 소유자 관문만 남겨 확인함.
	 */
	@Test
	void valid_token_of_other_user_404() {
		String tokenA = signup("file-own-a@b.com");
		signup("file-own-b@b.com");
		String url = (String) upload(tokenA, PNG, MediaType.IMAGE_PNG, "a.png").getBody().get("url");
		UUID fileId = idOf(url);
		UUID strangerId = userIdOf("file-own-b@b.com");

		String forged = fileTokenService.issue(fileId, strangerId);
		// byte[] 로 받음 - Map 으로 받으면 소유자 관문이 뚫렸을 때 단언 대신 컨버터 오류가 나 실패가 안 읽힘
		var res = rest.getForEntity("/api/files/" + fileId + "?token=" + forged, byte[].class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	/** R-2 교차 접근 - 파일 삭제도 소유자만(대화 경로는 ConversationCrossAccessTest 가 담당) */
	@Test
	void stranger_cannot_delete_others_file_404() {
		String tokenA = signup("file-del-a@b.com");
		String tokenB = signup("file-del-b@b.com");
		String url = (String) upload(tokenA, PNG, MediaType.IMAGE_PNG, "a.png").getBody().get("url");

		var del = rest.exchange("/api/files/" + idOf(url), HttpMethod.DELETE,
				new HttpEntity<>(bearer(tokenB)), Map.class);
		assertThat(del.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

		// 소유자에게는 그대로 남아 있어야 함
		var served = rest.getForEntity(url, byte[].class);
		assertThat(served.getStatusCode()).isEqualTo(HttpStatus.OK);
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
	void pdf_upload_is_rejected() {
		// 문서 첨부는 업로드·저장은 되는데 모델에는 전달되지 않아 오해를 만들었음 → 받지 않는 것을 계약으로 함
		// (2026-07-28 R-2 범위 축소, 사용자 승인)
		String token = signup("file-pdf@b.com");
		byte[] pdf = { 0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37 }; // %PDF-1.7
		var res = upload(token, pdf, MediaType.APPLICATION_PDF, "doc.pdf");
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(String.valueOf(res.getBody())).contains("문서 첨부는 지원하지 않음");
	}

	@Test
	void orphan_cleanup_removes_unlinked() {
		String token = signup("file7@b.com");
		String url = (String) upload(token, PNG, MediaType.IMAGE_PNG, "a.png").getBody().get("url");
		// 유예(10분)보다 오래된 고아만 회수 대상이므로 생성 시각을 과거로 옮겨 조건을 만듦
		jdbc.update("update attachments set created_at = now() - interval '2 hours' where id = ?", idOf(url));

		int removed = fileService.cleanupOrphans(OffsetDateTime.now());
		assertThat(removed).isGreaterThanOrEqualTo(1);

		var served = rest.getForEntity(url, Map.class);
		assertThat(served.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	/**
	 * cutoff 클램프 - 미래 cutoff 를 줘도 방금 올린 첨부는 남아야 함.
	 * 인자 하나로 <b>작성 중인 첨부</b>가 사라지면 사용자는 전송 버튼을 누르기도 전에 파일을 잃음.
	 */
	@Test
	void orphan_cleanup_keeps_fresh_upload_even_with_future_cutoff() {
		String token = signup("file8@b.com");
		String url = (String) upload(token, PNG, MediaType.IMAGE_PNG, "a.png").getBody().get("url");

		fileService.cleanupOrphans(OffsetDateTime.now().plusMinutes(1));

		var served = rest.getForEntity(url, byte[].class);
		assertThat(served.getStatusCode()).isEqualTo(HttpStatus.OK);
	}

	/**
	 * 대화 삭제 시 cascade 로 행이 먼저 사라진 뒤 파일 삭제가 실패하면, 행 기준 회수는 그 파일을
	 * <b>구조적으로 볼 수 없음</b>. 저장소 스캔 패스가 그 잔류를 지워야 함(2026-07-28 결정).
	 */
	@Test
	void unreferenced_old_file_is_removed_by_scan() throws Exception {
		String token = signup("scan-a@b.com");
		String url = (String) upload(token, PNG, MediaType.IMAGE_PNG, "a.png").getBody().get("url");
		UUID id = idOf(url);
		Path file = pathOf(id);

		jdbc.update("delete from attachments where id = ?", id); // cascade 로 행만 사라진 상태
		age(file); // 유예(10분)보다 오래된 것만 대상

		assertThat(Files.exists(file)).isTrue();
		assertThat(fileService.cleanupUnreferencedFiles(OffsetDateTime.now())).isGreaterThanOrEqualTo(1);
		assertThat(Files.exists(file)).isFalse();
	}

	/** 행이 살아 있는 파일은 아무리 오래돼도 건드리지 않음 - 이게 깨지면 정상 첨부가 사라짐 */
	@Test
	void referenced_file_is_kept_by_scan() throws Exception {
		String token = signup("scan-b@b.com");
		String url = (String) upload(token, PNG, MediaType.IMAGE_PNG, "a.png").getBody().get("url");
		Path file = pathOf(idOf(url));
		age(file);

		fileService.cleanupUnreferencedFiles(OffsetDateTime.now());

		assertThat(Files.exists(file)).isTrue();
	}

	/** 방금 올라온 파일은 행이 아직 없어도 유예로 보호함 - 업로드 도중 지워지면 안 됨 */
	@Test
	void fresh_unreferenced_file_is_kept_by_scan() {
		String token = signup("scan-c@b.com");
		String url = (String) upload(token, PNG, MediaType.IMAGE_PNG, "a.png").getBody().get("url");
		UUID id = idOf(url);
		Path file = pathOf(id);
		jdbc.update("delete from attachments where id = ?", id);

		fileService.cleanupUnreferencedFiles(OffsetDateTime.now());

		assertThat(Files.exists(file)).isTrue();
	}

	/** 서빙 응답에 MIME 스니핑 차단 헤더가 붙어야 함 - 업로드한 바이트가 다른 타입으로 해석되는 것을 막음 */
	@Test
	void served_file_has_nosniff_header() {
		String token = signup("file9@b.com");
		String url = (String) upload(token, PNG, MediaType.IMAGE_PNG, "a.png").getBody().get("url");

		var served = rest.getForEntity(url, byte[].class);
		assertThat(served.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
	}

	private static UUID idOf(String url) {
		return UUID.fromString(url.substring(url.indexOf("/api/files/") + 11, url.indexOf('?')));
	}

	private UUID userIdOf(String email) {
		return jdbc.queryForObject("select id from users where email = ?", UUID.class, email);
	}

	/** 첨부 id → 실제 파일 경로(행이 지워지기 전에 뽑아 둘 것) */
	private Path pathOf(UUID attachmentId) {
		String storagePath = jdbc.queryForObject(
				"select storage_path from attachments where id = ?", String.class, attachmentId);
		try {
			return fileStorage.load(storagePath).getFile().toPath();
		} catch (Exception e) {
			throw new IllegalStateException("파일 경로 확인 실패: " + storagePath, e);
		}
	}

	/** 유예 밖으로 밀어냄 - 수정 시각 기준이라 파일 자체를 늙힘 */
	private static void age(Path file) throws Exception {
		Files.setLastModifiedTime(file, FileTime.from(Instant.now().minus(2, ChronoUnit.HOURS)));
	}
}
