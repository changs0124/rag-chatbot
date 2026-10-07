package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.nio.charset.StandardCharsets;
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

import com.ragchatbot.entity.RagDocument;
import com.ragchatbot.repository.RagDocumentRepository;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 스토어 동기화 (#193 · FEAT-ADMIN-002 · TC-ADMIN-047~052).
 *
 * <p>목업 스토어와 DB 는 테스트 클래스끼리 공유된다. 그래서 「이번에 몇 건 들어왔나」의 절댓값 대신
 * <b>이 케이스가 만든 파일 하나의 행</b>을 보고 판정한다 - 앞선 클래스가 남긴 파일이 함께 들어와도 흔들리지 않게.
 */
class AdminDocumentSyncFlowTest extends AbstractPgIntegrationTest {

	@Autowired
	private RagDocumentRepository documentRepository;

	private static final byte[] PDF = "%PDF-1.4 동기화 본문".getBytes(StandardCharsets.UTF_8);

	/** 업로드하고 그 문서의 OpenAI 파일 ID 를 돌려줌 */
	@SuppressWarnings("rawtypes")
	private String upload(String token, String filename) {
		MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
		HttpHeaders partHeaders = new HttpHeaders();
		partHeaders.setContentType(MediaType.APPLICATION_PDF);
		body.add("file", new HttpEntity<>(new ByteArrayResource(PDF) {
			@Override
			public String getFilename() {
				return filename;
			}
		}, partHeaders));
		HttpHeaders headers = bearer(token);
		headers.setContentType(MediaType.MULTIPART_FORM_DATA);
		ResponseEntity<Map> res = rest.postForEntity("/api/admin/documents", new HttpEntity<>(body, headers), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CREATED);
		return jdbc.queryForObject("select openai_file_id from rag_documents where id = ?::uuid", String.class,
				res.getBody().get("id"));
	}

	@SuppressWarnings("rawtypes")
	private ResponseEntity<Map> sync(String token) {
		return rest.exchange("/api/admin/documents/sync", HttpMethod.POST, new HttpEntity<>(bearer(token)), Map.class);
	}

	private int aliveRows(String fileId) {
		return jdbc.queryForObject(
				"select count(*) from rag_documents where openai_file_id = ? and deleted_at is null", Integer.class, fileId);
	}

	/**
	 * TC-ADMIN-047 : 스토어에는 있는데 이 DB 에 행이 없는 파일이 들어온다.
	 * 다른 서버 DB 로 올린 상황을 행 삭제로 만든다. 「올린 사람」은 동기화한 관리자다
	 */
	@Test
	void sync_registers_store_file_missing_from_db() {
		String uploader = createAdminUser("sync-uploader@b.com");
		String fileId = upload(uploader, "다른서버.pdf");
		jdbc.update("delete from rag_documents where openai_file_id = ?", fileId);

		String syncer = createAdminUser("sync-runner@b.com");
		var res = sync(syncer);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(((Number) res.getBody().get("added")).intValue()).isGreaterThanOrEqualTo(1);
		var row = jdbc.queryForMap("""
				select d.filename, d.byte_size, d.status, u.email
				from rag_documents d join users u on u.id = d.uploaded_by
				where d.openai_file_id = ? and d.deleted_at is null""", fileId);
		assertThat(row).containsEntry("filename", "다른서버.pdf")
				.containsEntry("byte_size", (long) PDF.length)
				.containsEntry("status", "completed")
				.containsEntry("email", "sync-runner@b.com");
	}

	/** TC-ADMIN-048 : 두 번 눌러도 행이 늘지 않는다 */
	@Test
	void sync_is_idempotent() {
		String token = createAdminUser("sync-twice@b.com");
		String fileId = upload(token, "두번.pdf");
		jdbc.update("delete from rag_documents where openai_file_id = ?", fileId);

		sync(token);
		int rowsAfterFirst = jdbc.queryForObject("select count(*) from rag_documents", Integer.class);
		var second = sync(token);

		assertThat(((Number) second.getBody().get("added")).intValue()).isZero();
		assertThat(jdbc.queryForObject("select count(*) from rag_documents", Integer.class)).isEqualTo(rowsAfterFirst);
		assertThat(aliveRows(fileId)).isEqualTo(1);
	}

	/**
	 * TC-ADMIN-049 : 지운 행만 있고 스토어에는 남은 파일은 새 행으로 다시 들어온다.
	 * 삭제 때 OpenAI 정리가 실패한 상태를 DB 만 지워 만든다. 옛 행은 이력으로 남는다
	 */
	@Test
	void soft_deleted_row_with_file_still_in_store_is_reregistered() {
		String token = createAdminUser("sync-resurrect@b.com");
		String fileId = upload(token, "정리실패.pdf");
		jdbc.update("update rag_documents set deleted_at = now() where openai_file_id = ?", fileId);

		sync(token);

		assertThat(aliveRows(fileId)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from rag_documents where openai_file_id = ?", Integer.class,
				fileId)).isEqualTo(2);
	}

	/** TC-ADMIN-050 : 동기화로 들어온 문서를 지우면 스토어에서도 빠져, 다시 동기화해도 돌아오지 않는다 */
	@Test
	void deleting_synced_document_removes_it_from_store() {
		String token = createAdminUser("sync-delete@b.com");
		String fileId = upload(token, "동기화후삭제.pdf");
		jdbc.update("delete from rag_documents where openai_file_id = ?", fileId);
		sync(token);
		String docId = jdbc.queryForObject(
				"select id::text from rag_documents where openai_file_id = ? and deleted_at is null", String.class, fileId);

		var deleted = rest.exchange("/api/admin/documents/" + docId, HttpMethod.DELETE,
				new HttpEntity<>(bearer(token)), Void.class);
		sync(token);

		assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
		assertThat(aliveRows(fileId)).isZero();
	}

	/** TC-ADMIN-051 : 일반 사용자는 404(P-3), 미인증은 401 */
	@Test
	void plain_user_gets_not_found_and_anonymous_gets_unauthorized() {
		String user = createUser("sync-plain@b.com");

		assertThat(sync(user).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(rest.exchange("/api/admin/documents/sync", HttpMethod.POST, HttpEntity.EMPTY, Map.class)
				.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	/**
	 * TC-ADMIN-052 : 동시에 두 번 실행돼도 같은 파일이 두 행이 되지 않는다 - V9 부분 유니크 인덱스.
	 * 경합을 직접 만들 수는 없어, 두 번째 삽입이 서비스의 사전 확인을 건너뛴 상황을 리포지토리로 재현한다
	 */
	@Test
	void alive_file_id_is_unique_but_deleted_rows_are_not_counted() {
		String token = createAdminUser("sync-unique@b.com");
		String fileId = upload(token, "유니크.pdf");
		UUID adminId = jdbc.queryForObject("select id from users where email = ?", UUID.class, "sync-unique@b.com");
		RagDocument again = new RagDocument(UUID.randomUUID(), "유니크.pdf", fileId, "mock-vector-store", 1,
				"completed", adminId, null, null);

		assertThat(documentRepository.insertIfAbsent(again)).isZero();
		assertThat(catchThrowable(() -> documentRepository.insert(again))).isNotNull();

		jdbc.update("update rag_documents set deleted_at = now() where openai_file_id = ?", fileId);
		assertThat(documentRepository.insertIfAbsent(again)).isEqualTo(1);
	}
}
