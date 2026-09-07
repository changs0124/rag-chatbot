package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
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
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import com.ragchatbot.repository.UserRepository;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * RAG 문서 관리 (FEAT-ADMIN-002 · TC-ADMIN-010~021).
 *
 * <p>`APP_MODE=mock` 이라 OpenAI 호출은 목업이 받는다 - CI 에 키가 없고, 있어도 게이트가
 * 외부 장애에 물리면 안 된다. 실 응답 대조는 `docs/01_specs/live-integration.md` 의 수동 절차다.
 */
class AdminDocumentFlowTest extends AbstractPgIntegrationTest {

	@Autowired
	private UserRepository userRepository;

	/** 가입 후 그 계정을 관리자로 올리고 토큰을 돌려줌 */
	private String signupAdmin(String email) {
		String token = signup(email);
		userRepository.promoteAdmins(List.of(email));
		return token;
	}

	private static HttpEntity<MultiValueMap<String, Object>> multipart(String token, String filename,
			byte[] content, String contentType) {
		MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
		HttpHeaders partHeaders = new HttpHeaders();
		partHeaders.setContentType(MediaType.parseMediaType(contentType));
		ByteArrayResource resource = new ByteArrayResource(content) {
			@Override
			public String getFilename() {
				return filename;
			}
		};
		body.add("file", new HttpEntity<>(resource, partHeaders));

		HttpHeaders headers = new HttpHeaders();
		headers.setBearerAuth(token);
		headers.setContentType(MediaType.MULTIPART_FORM_DATA);
		return new HttpEntity<>(body, headers);
	}

	private static byte[] pdf() {
		return "%PDF-1.4 규정 본문".getBytes(StandardCharsets.UTF_8);
	}

	@SuppressWarnings("rawtypes")
	private ResponseEntity<Map> upload(String token, String filename, byte[] content, String contentType) {
		return rest.postForEntity("/api/admin/documents",
				multipart(token, filename, content, contentType), Map.class);
	}

	@SuppressWarnings("rawtypes")
	private ResponseEntity<List> list(String token) {
		return rest.exchange("/api/admin/documents", HttpMethod.GET, new HttpEntity<>(bearer(token)), List.class);
	}

	/** TC-ADMIN-010 : 관리자가 PDF를 올리면 목록에 뜬다 */
	@SuppressWarnings("unchecked")
	@Test
	void admin_uploads_pdf_and_sees_it_in_list() {
		String token = signupAdmin("doc-upload@b.com");

		var created = upload(token, "취업규칙.pdf", pdf(), "application/pdf");
		assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);

		var listed = list(token);
		assertThat(listed.getStatusCode()).isEqualTo(HttpStatus.OK);
		List<Map<String, Object>> rows = listed.getBody();
		assertThat(rows).anySatisfy(r -> {
			assertThat(r.get("filename")).isEqualTo("취업규칙.pdf");
			// 올린 사람 이름이 실려야 감사 기록이 화면에서 읽힘(REQ-ADMIN-002)
			assertThat(r.get("uploadedByName")).isEqualTo("사용자");
		});
	}

	/**
	 * 목록 한 행이 계약의 여섯 필드를 <b>제 출처에서</b> 실어 온다.
	 *
	 * <p>`summaryResult` 는 위치 기반 `<constructor>` 라 SQL 이 응답 스펙에 직결돼 있다.
	 * 값을 단언하지 않으면 결선이 어긋나도 조용히 통과한다 - `byte_size` 를 `0` 으로, `status` 를
	 * 리터럴로, `created_at` 을 <b>올린 사람의 가입 시각</b>으로 바꿔도 이 파일의 나머지 케이스는
	 * 전부 통과했다(#25 실측).
	 *
	 * <p>반대로 <b>arg 순서 교환은 여기서 막는 대상이 아니다.</b> 타입이 다르면 생성자를 못 찾아
	 * 질의 시점에 터지고, 타입 시퀀스를 보존하는 교환은 String 셋(filename·status·uploadedByName)
	 * 사이뿐인데 3원소 순열은 항등이 아니면 최소 둘을 움직여 위 케이스의 두 단언에 걸린다.
	 */
	@SuppressWarnings("unchecked")
	@Test
	void list_row_carries_every_contract_field_from_its_own_source() {
		String email = "doc-contract@b.com";
		String token = signupAdmin(email);
		byte[] content = pdf();
		var created = upload(token, "계약고정.pdf", content, "application/pdf");
		String id = (String) created.getBody().get("id");

		List<Map<String, Object>> rows = list(token).getBody();
		Map<String, Object> row = rows.stream().filter(r -> id.equals(r.get("id"))).findFirst().orElseThrow();

		// 필드가 늘거나 줄면 프론트의 RagDocument 와 어긋난다 - scripts/check-response-contract.sh 가 이름을, 여기가 값을 본다
		assertThat(row).containsOnlyKeys("id", "filename", "byteSize", "status", "uploadedByName", "createdAt");
		assertThat(row.get("filename")).isEqualTo("계약고정.pdf");
		assertThat(row.get("uploadedByName")).isEqualTo("사용자");
		// 실제로 올린 바이트 수. 리터럴이나 다른 컬럼으로 바뀌면 여기서 갈린다
		assertThat(((Number) row.get("byteSize")).longValue()).isEqualTo(content.length);
		// 목업은 인덱싱을 기다릴 것이 없으므로 목록 조회가 in_progress 를 completed 로 올려 둔다
		assertThat(row.get("status")).isEqualTo("completed");
		// 문서 행의 생성 시각이어야 한다 - 조인한 users 쪽 created_at 을 집어와도 타입이 같아 안 터진다.
		// 두 시각을 재서 비교하는 것이 아니라 **같은 컬럼 값을 두 경로로 읽어** 맞추는 것이므로
		// CONVENTIONS 의 "시각에 등호를 걸지 않는다" 에 걸리지 않는다 - 시계 해상도와 무관하다
		OffsetDateTime documentCreatedAt = jdbc.queryForObject(
				"select created_at from rag_documents where id = ?::uuid", OffsetDateTime.class, id);
		assertThat(OffsetDateTime.parse((String) row.get("createdAt")).toInstant())
				.isEqualTo(documentCreatedAt.toInstant());
	}

	/**
	 * TC-ADMIN-011 : 허용하지 않는 형식은 400.
	 *
	 * <p>채팅 첨부는 이미지만 받고 여기는 문서만 받는다 - <b>두 목록이 반대</b>라 서로의 규칙이
	 * 새면 바로 드러난다.
	 */
	@Test
	void image_is_rejected_as_document() {
		String token = signupAdmin("doc-image@b.com");

		var res = upload(token, "photo.png", new byte[] { (byte) 0x89, 0x50, 0x4E, 0x47 }, "image/png");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}

	/** TC-ADMIN-013 : 확장자만 PDF인 파일은 400 (매직바이트 검사) */
	@Test
	void fake_pdf_is_rejected() {
		String token = signupAdmin("doc-fake@b.com");

		var res = upload(token, "fake.pdf", "이건 PDF가 아님".getBytes(StandardCharsets.UTF_8),
				"application/pdf");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}

	/** 매직바이트가 없는 형식(txt·md)은 검사하지 않으므로 통과해야 한다 - 검사하는 척하지 않음 */
	@Test
	void text_document_without_magic_bytes_is_accepted() {
		String token = signupAdmin("doc-text@b.com");

		var res = upload(token, "FAQ.md", "# 자주 묻는 질문".getBytes(StandardCharsets.UTF_8), "text/markdown");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CREATED);
	}

	/** TC-ADMIN-015 : 목록은 최신순 */
	@SuppressWarnings("unchecked")
	@Test
	void list_is_newest_first() {
		String token = signupAdmin("doc-order@b.com");
		upload(token, "먼저.pdf", pdf(), "application/pdf");
		upload(token, "나중.pdf", pdf(), "application/pdf");

		List<Map<String, Object>> rows = list(token).getBody();

		assertThat(rows.get(0).get("filename")).isEqualTo("나중.pdf");
	}

	/** TC-ADMIN-016 : 삭제한 문서는 목록에서 빠진다 */
	@SuppressWarnings("unchecked")
	@Test
	void deleted_document_disappears_from_list() {
		String token = signupAdmin("doc-delete@b.com");
		var created = upload(token, "지울문서.pdf", pdf(), "application/pdf");
		String id = (String) created.getBody().get("id");

		var deleted = rest.exchange("/api/admin/documents/" + id, HttpMethod.DELETE,
				new HttpEntity<>(bearer(token)), Void.class);
		assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

		List<Map<String, Object>> rows = list(token).getBody();
		assertThat(rows).noneSatisfy(r -> assertThat(r.get("id")).isEqualTo(id));
	}

	/**
	 * TC-ADMIN-017 : 삭제해도 행은 남고 삭제 시각이 찍힌다.
	 *
	 * <p>감사 기록(REQ-ADMIN-002)이 성립하는지 보는 유일한 케이스다. 목록에서 빠지는 것만 보면
	 * hard delete 로 바뀌어도 통과한다.
	 */
	@Test
	void delete_is_soft_and_keeps_the_row() {
		String token = signupAdmin("doc-soft@b.com");
		var created = upload(token, "감사대상.pdf", pdf(), "application/pdf");
		String id = (String) created.getBody().get("id");

		rest.exchange("/api/admin/documents/" + id, HttpMethod.DELETE,
				new HttpEntity<>(bearer(token)), Void.class);

		Integer alive = jdbc.queryForObject(
				"select count(*) from rag_documents where id = ?::uuid and deleted_at is not null",
				Integer.class, id);
		assertThat(alive).isEqualTo(1);
	}

	/** 이미 지운 문서를 또 지우면 404 */
	@Test
	void deleting_twice_is_not_found() {
		String token = signupAdmin("doc-twice@b.com");
		var created = upload(token, "두번.pdf", pdf(), "application/pdf");
		String id = (String) created.getBody().get("id");
		rest.exchange("/api/admin/documents/" + id, HttpMethod.DELETE,
				new HttpEntity<>(bearer(token)), Void.class);

		var second = rest.exchange("/api/admin/documents/" + id, HttpMethod.DELETE,
				new HttpEntity<>(bearer(token)), Void.class);

		assertThat(second.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	/** TC-ADMIN-018 : 일반 사용자는 목록을 못 본다 — 403 이 아니라 404 */
	@Test
	void plain_user_gets_not_found_on_list() {
		String token = signup("doc-plain@b.com");

		// 오류 본문은 ApiError 객체라 List 로 못 받음 - 상태 코드만 보면 되므로 String 으로 받는다
		var res = rest.exchange("/api/admin/documents", HttpMethod.GET,
				new HttpEntity<>(bearer(token)), String.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	/** TC-ADMIN-019 : 일반 사용자는 문서를 못 지운다 */
	@Test
	void plain_user_cannot_delete() {
		String adminToken = signupAdmin("doc-owner@b.com");
		var created = upload(adminToken, "보호대상.pdf", pdf(), "application/pdf");
		String id = (String) created.getBody().get("id");
		String plainToken = signup("doc-intruder@b.com");

		var res = rest.exchange("/api/admin/documents/" + id, HttpMethod.DELETE,
				new HttpEntity<>(bearer(plainToken)), Void.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		Integer stillAlive = jdbc.queryForObject(
				"select count(*) from rag_documents where id = ?::uuid and deleted_at is null",
				Integer.class, id);
		assertThat(stillAlive).isEqualTo(1);
	}

	/** TC-ADMIN-007 : 미인증은 401 (404 가 아니다 — 인증하면 될 수도 있다는 사실은 숨기지 않는다) */
	@Test
	void unauthenticated_gets_unauthorized() {
		var res = rest.exchange("/api/admin/documents", HttpMethod.GET, HttpEntity.EMPTY, String.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	/**
	 * TC-ADMIN-020 : 올린 사람을 지워도 문서 이력은 남는다.
	 *
	 * <p>`conversations` 는 cascade 인데 `rag_documents.uploaded_by` 만 restrict 다.
	 * 그 차이가 의도된 것임을 케이스로 고정한다.
	 */
	@Test
	void deleting_uploader_is_blocked_by_reference() {
		String token = signupAdmin("doc-uploader@b.com");
		upload(token, "이력보존.pdf", pdf(), "application/pdf");
		UUID uploaderId = jdbc.queryForObject("select id from users where email = ?", UUID.class,
				"doc-uploader@b.com");

		assertThat(org.assertj.core.api.Assertions.catchThrowable(
				() -> jdbc.update("delete from users where id = ?", uploaderId)))
				.isNotNull();
	}

	/** TC-ADMIN-021 : 목업 모드에서 파일 ID 가 mock- 으로 시작해 실 데이터와 섞이지 않는다 */
	@Test
	void mock_mode_marks_file_ids() {
		String token = signupAdmin("doc-mock@b.com");
		var created = upload(token, "목업.pdf", pdf(), "application/pdf");
		String id = (String) created.getBody().get("id");

		String fileId = jdbc.queryForObject(
				"select openai_file_id from rag_documents where id = ?::uuid", String.class, id);

		assertThat(fileId).startsWith("mock-");
	}
}
