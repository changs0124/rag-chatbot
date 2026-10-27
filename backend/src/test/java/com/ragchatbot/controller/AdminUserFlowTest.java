package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.ragchatbot.storage.FileStorage;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 관리자에 의한 사용자 관리 (FEAT-ADMIN-003 · TC-ADMIN-030~034 · 006) · 사용자 삭제 (FEAT-ADMIN-004 · TC-ADMIN-080~087).
 */
class AdminUserFlowTest extends AbstractPgIntegrationTest {

	@Autowired
	private FileStorage fileStorage;

	@SuppressWarnings("rawtypes")
	private ResponseEntity<Map> reset(String token, UUID targetId) {
		return rest.exchange("/api/admin/users/" + targetId + "/password-reset", HttpMethod.POST,
				new HttpEntity<>(bearer(token)), Map.class);
	}

	// 성공은 본문이 없고 오류는 ApiError 객체라 상태 코드만 보면 되므로 String 으로 받는다
	private ResponseEntity<String> deleteUser(String token, UUID targetId) {
		return rest.exchange("/api/admin/users/" + targetId, HttpMethod.DELETE,
				new HttpEntity<>(bearer(token)), String.class);
	}

	private int countUsers(UUID id) {
		return jdbc.queryForObject("select count(*) from users where id = ?", Integer.class, id);
	}

	/**
	 * 계정 발급은 관리자만 할 수 있다(FEAT-AUTH-001).
	 *
	 * <p>403 이 아니라 <b>404</b> 다 - 관리 기능의 존재 자체를 드러내지 않는 이 컨트롤러의 규칙(P-3)이
	 * 새 엔드포인트에도 적용되는지를 본다. 여기만 403 이면 경로의 존재가 새어 규칙이 무너진다.
	 */
	@SuppressWarnings("rawtypes")
	@Test
	void plain_user_cannot_issue_accounts() {
		String plainToken = createUser("issue-intruder@b.com");

		ResponseEntity<Map> res = rest.exchange("/api/admin/users", HttpMethod.POST,
				new HttpEntity<>(Map.of("email", "issue-victim@b.com", "name", "피해자"), bearer(plainToken)),
				Map.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		Integer created = jdbc.queryForObject("select count(*) from users where email = ?", Integer.class,
				"issue-victim@b.com");
		assertThat(created).isZero();
	}

	/**
	 * 발급된 계정은 <b>일반 사용자</b>다 - 관리자 명단에 없는 주소이므로.
	 *
	 * <p>발급하는 쪽이 관리자라는 이유로 받는 쪽까지 관리자가 되면, 계정 하나 만들 때마다 관리 권한이
	 * 번지고 그 사실이 화면 어디에도 보이지 않는다.
	 */
	@Test
	void issued_account_is_a_plain_user() {
		createUser("issue-role@b.com");

		String role = jdbc.queryForObject("select role from users where email = ?", String.class,
				"issue-role@b.com");

		assertThat(role).isEqualTo("user");
	}

	/** TC-ADMIN-030 : 임시 비밀번호가 1회 반환된다 */
	@SuppressWarnings("unchecked")
	@Test
	void admin_gets_temporary_password_once() {
		String adminToken = createAdminUser("reset-admin@b.com");
		createUser("reset-target@b.com");

		var res = reset(adminToken, userId("reset-target@b.com"));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat((String) res.getBody().get("temporaryPassword")).isNotBlank();
	}

	/** TC-ADMIN-031 : 발급된 값으로 로그인된다 */
	@SuppressWarnings({ "unchecked", "rawtypes" })
	@Test
	void temporary_password_works_for_login() {
		String adminToken = createAdminUser("reset-admin2@b.com");
		createUser("reset-login@b.com");
		String temporary = (String) reset(adminToken, userId("reset-login@b.com")).getBody()
				.get("temporaryPassword");

		ResponseEntity<Map> login = rest.postForEntity("/api/auth/login",
				Map.of("email", "reset-login@b.com", "password", temporary), Map.class);

		assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
	}

	/**
	 * TC-ADMIN-032 : 초기화 직후 대상의 기존 토큰이 무효가 된다.
	 *
	 * <p>기존 `password_changed_at` 무효화 규칙을 그대로 타는지 보는 케이스다.
	 * 안 타면 계정 탈취 대응이 성립하지 않는다.
	 */
	@SuppressWarnings("rawtypes")
	@Test
	void reset_invalidates_target_existing_tokens() {
		String adminToken = createAdminUser("reset-admin3@b.com");
		String targetToken = createUser("reset-kick@b.com");
		// 초기화 전에는 멀쩡히 쓰인다
		assertThat(rest.exchange("/api/auth/me", HttpMethod.GET, new HttpEntity<>(bearer(targetToken)),
				Map.class).getStatusCode()).isEqualTo(HttpStatus.OK);

		reset(adminToken, userId("reset-kick@b.com"));

		ResponseEntity<Map> after = rest.exchange("/api/auth/me", HttpMethod.GET,
				new HttpEntity<>(bearer(targetToken)), Map.class);
		assertThat(after.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	/** TC-ADMIN-033 : 두 번 초기화하면 값이 다르다 - 난수가 고정값이 아님 */
	@SuppressWarnings("unchecked")
	@Test
	void two_resets_produce_different_passwords() {
		String adminToken = createAdminUser("reset-admin4@b.com");
		createUser("reset-twice@b.com");
		UUID target = userId("reset-twice@b.com");

		String first = (String) reset(adminToken, target).getBody().get("temporaryPassword");
		String second = (String) reset(adminToken, target).getBody().get("temporaryPassword");

		assertThat(first).isNotEqualTo(second);
	}

	/** TC-ADMIN-034 : 일반 사용자는 남의 비밀번호를 초기화할 수 없다 */
	@Test
	void plain_user_cannot_reset_others() {
		createUser("reset-victim@b.com");
		String plainToken = createUser("reset-intruder@b.com");

		var res = reset(plainToken, userId("reset-victim@b.com"));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	/** 자기 자신은 대상이 아니다 - 마이페이지에 변경 기능이 이미 있고, 자기 세션을 스스로 끊을 이유가 없다 */
	@Test
	void admin_cannot_reset_self() {
		String adminToken = createAdminUser("reset-self@b.com");

		var res = reset(adminToken, userId("reset-self@b.com"));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}

	/** TC-ADMIN-006 : 일반 사용자의 사용자 목록 조회는 404 */
	@Test
	void plain_user_cannot_list_users() {
		String plainToken = createUser("list-plain@b.com");

		// 오류 본문은 ApiError 객체라 List 로 못 받음 - 상태 코드만 보면 되므로 String 으로 받는다
		var res = rest.exchange("/api/admin/users", HttpMethod.GET,
				new HttpEntity<>(bearer(plainToken)), String.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	/**
	 * 발급하는 이름도 앞뒤 공백을 걷는다(#327). 마이페이지 이름 변경과 대화 제목은 이미 걷는데
	 * 여기만 그대로 저장하면 같은 사람이 목록에서 공백째 보인다.
	 */
	@SuppressWarnings({ "unchecked", "rawtypes" })
	@Test
	void issued_name_is_trimmed() {
		String adminToken = createAdminUser("trim-admin@b.com");
		assertThat(issueRaw("trim-target@b.com", "  관리자 ").getStatusCode()).isEqualTo(HttpStatus.CREATED);

		ResponseEntity<List> res = rest.exchange("/api/admin/users", HttpMethod.GET,
				new HttpEntity<>(bearer(adminToken)), List.class);

		List<Map<String, Object>> rows = res.getBody();
		assertThat(rows).anySatisfy(r -> {
			assertThat(r.get("email")).isEqualTo("trim-target@b.com");
			assertThat(r.get("name")).isEqualTo("관리자");
		});
	}

	/**
	 * 형식이 틀린 경로 변수는 <b>관리자 확인보다 먼저</b> 걸려 일반 사용자도 400 을 받는다(#327).
	 * 컨트롤러 javadoc 이 적은 그대로다 - 인가는 본문 진입 시 확인하므로, 이 순서가 바뀌면 javadoc 도 같이 고친다.
	 */
	@Test
	void malformed_path_is_rejected_before_admin_check() {
		String plainToken = createUser("malformed-plain@b.com");

		var res = rest.exchange("/api/admin/users/not-a-uuid/password-reset", HttpMethod.POST,
				new HttpEntity<>(bearer(plainToken)), String.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}

	/** 관리자 목록에는 역할이 실려야 화면이 "관리자/사용자"를 구분해 보여줄 수 있다 */
	@SuppressWarnings({ "unchecked", "rawtypes" })
	@Test
	void user_list_carries_role() {
		String adminToken = createAdminUser("list-admin@b.com");

		ResponseEntity<List> res = rest.exchange("/api/admin/users", HttpMethod.GET,
				new HttpEntity<>(bearer(adminToken)), List.class);

		List<Map<String, Object>> rows = res.getBody();
		assertThat(rows).anySatisfy(r -> {
			assertThat(r.get("email")).isEqualTo("list-admin@b.com");
			assertThat(r.get("role")).isEqualTo("admin");
		});
	}

	/** 발급하는 이름도 50자(trim 뒤 코드 포인트)까지다(#413). 51자는 400 이고 계정이 만들어지지 않는다 */
	@SuppressWarnings("rawtypes")
	@Test
	void issued_name_over_50_chars_is_rejected_and_not_created() {
		ResponseEntity<Map> res = issueRaw("long-name@b.com", "가".repeat(51));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		Integer created = jdbc.queryForObject("select count(*) from users where email = ?", Integer.class,
				"long-name@b.com");
		assertThat(created).isZero();
	}

	/** 이모지는 한 자로 센다 - 이모지 49 + 한글 1 = 50자는 통과 */
	@SuppressWarnings("rawtypes")
	@Test
	void issued_name_of_50_code_points_is_accepted() {
		ResponseEntity<Map> res = issueRaw("fifty-name@b.com", "😀".repeat(49) + "가");

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CREATED);
	}

	/** TC-ADMIN-080 : 일반 사용자를 지우면 204 이고 목록에서 사라진다 */
	@SuppressWarnings({ "unchecked", "rawtypes" })
	@Test
	void admin_deletes_plain_user() {
		String adminToken = createAdminUser("del-admin@b.com");
		createUser("del-target@b.com");
		UUID target = userId("del-target@b.com");

		assertThat(deleteUser(adminToken, target).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

		assertThat(countUsers(target)).isZero();
		List<Map<String, Object>> rows = rest.exchange("/api/admin/users", HttpMethod.GET,
				new HttpEntity<>(bearer(adminToken)), List.class).getBody();
		assertThat(rows).noneSatisfy(r -> assertThat(r.get("email")).isEqualTo("del-target@b.com"));
	}

	/**
	 * TC-ADMIN-081 : 대화 · 첨부 행은 cascade 로, 첨부 파일은 DB 삭제 뒤 디스크에서 함께 지워진다.
	 *
	 * <p>파일은 DB 가 모르므로 앱이 지우기 전에 경로를 읽어 두어야 한다 - 그 순서가 빠지면 행만 사라지고 파일은
	 * 매시 회수까지 남는다. 여기서는 회수를 기다리지 않고 응답 직후 파일이 없는지 본다.
	 */
	@Test
	void delete_cascades_conversations_attachments_and_files() throws Exception {
		String adminToken = createAdminUser("del-cascade-admin@b.com");
		String targetToken = createUser("del-cascade@b.com");
		UUID target = userId("del-cascade@b.com");
		createConversation(targetToken);
		assertThat(rest.postForEntity("/api/files", multipart(targetToken, "a.png", PNG_MAGIC, MediaType.IMAGE_PNG),
				String.class).getStatusCode()).isEqualTo(HttpStatus.OK);
		String storagePath = jdbc.queryForObject("select storage_path from attachments where user_id = ?",
				String.class, target);
		Path file = fileStorage.load(storagePath).getFile().toPath();
		assertThat(Files.exists(file)).isTrue();

		assertThat(deleteUser(adminToken, target).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

		assertThat(jdbc.queryForObject("select count(*) from conversations where user_id = ?", Integer.class,
				target)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from attachments where user_id = ?", Integer.class,
				target)).isZero();
		assertThat(Files.exists(file)).isFalse();
	}

	/**
	 * TC-ADMIN-082 : 지운 사용자의 남은 토큰은 다음 요청에서 401 이다.
	 *
	 * <p>코드를 더하지 않았다 - 인증 필터가 비밀번호 변경 기준선을 읽을 때 사용자가 없으면 무효로 친다.
	 * 그 규칙이 바뀌면 지운 사람의 세션이 만료까지 살아남으므로 케이스로 잠근다.
	 */
	@Test
	void deleted_user_token_is_rejected() {
		String adminToken = createAdminUser("del-token-admin@b.com");
		String targetToken = createUser("del-token@b.com");
		assertThat(rest.exchange("/api/auth/me", HttpMethod.GET, new HttpEntity<>(bearer(targetToken)),
				String.class).getStatusCode()).isEqualTo(HttpStatus.OK);

		deleteUser(adminToken, userId("del-token@b.com"));

		assertThat(rest.exchange("/api/auth/me", HttpMethod.GET, new HttpEntity<>(bearer(targetToken)),
				String.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
	}

	/**
	 * TC-ADMIN-083 : 관리자 계정은 지우지 않는다(400) - 명단에 남은 계정은 기동 동기화가 다시 만든다.
	 * 내리려면 명단에서 빼는 것이 유일한 길이다
	 */
	@Test
	void admin_account_cannot_be_deleted() {
		String adminToken = createAdminUser("del-admin2@b.com");
		createAdminUser("del-other-admin@b.com");
		UUID other = userId("del-other-admin@b.com");

		assertThat(deleteUser(adminToken, other).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(countUsers(other)).isOne();
	}

	/** TC-ADMIN-084 : 자기 자신도 관리자이므로 같은 규칙으로 400 이다 */
	@Test
	void admin_cannot_delete_self() {
		String adminToken = createAdminUser("del-self@b.com");
		UUID self = userId("del-self@b.com");

		assertThat(deleteUser(adminToken, self).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(countUsers(self)).isOne();
	}

	/** TC-ADMIN-085 : 없는 사용자는 404 */
	@Test
	void deleting_missing_user_is_not_found() {
		String adminToken = createAdminUser("del-missing-admin@b.com");

		assertThat(deleteUser(adminToken, UUID.randomUUID()).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	/** TC-ADMIN-086 : 일반 사용자는 남을 지울 수 없다 - 다른 관리자 API 와 같이 404 이고 대상은 그대로다 */
	@Test
	void plain_user_cannot_delete_others() {
		createUser("del-victim@b.com");
		String plainToken = createUser("del-intruder@b.com");
		UUID victim = userId("del-victim@b.com");

		assertThat(deleteUser(plainToken, victim).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(countUsers(victim)).isOne();
	}

	/**
	 * TC-ADMIN-087 : 문서를 올린 기록이 있으면 409 이고 아무것도 지워지지 않는다.
	 *
	 * <p>목록에서 내린(soft delete) 문서로 고정한다 - 살아 있는 문서만 막는다고 읽으면 "문서를 지우고 다시 시도"가
	 * 통할 것 같지만 행이 남아 있어 restrict 가 그대로 걸린다. 업로드는 관리자만 하므로 행을 직접 넣어
	 * 강등된 전 관리자의 기록을 흉내 낸다.
	 */
	@Test
	void uploader_cannot_be_deleted_even_after_document_removed() {
		String adminToken = createAdminUser("del-uploader-admin@b.com");
		String uploaderToken = createUser("del-uploader@b.com");
		UUID uploader = userId("del-uploader@b.com");
		createConversation(uploaderToken);
		jdbc.update("insert into rag_documents (filename, openai_file_id, vector_store_id, byte_size, status, "
				+ "uploaded_by, deleted_at) values ('내린문서.pdf', 'mock-del-uploader', 'vs_test', 10, 'completed', ?, now())",
				uploader);

		assertThat(deleteUser(adminToken, uploader).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);

		assertThat(countUsers(uploader)).isOne();
		assertThat(jdbc.queryForObject("select count(*) from conversations where user_id = ?", Integer.class,
				uploader)).isOne();
	}
}
