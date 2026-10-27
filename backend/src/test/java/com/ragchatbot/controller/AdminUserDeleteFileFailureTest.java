package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import com.ragchatbot.storage.FileStorage;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * TC-ADMIN-088 : 사용자 삭제 뒤 첨부 파일 삭제가 실패해도 응답은 204 다(FEAT-ADMIN-004).
 *
 * <p>DB 는 이미 지워졌으니 되돌릴 것이 없다 - 실패를 500 으로 내면 관리자는 다시 시도하고 404 만 받는다.
 * 남은 파일은 가리키는 행이 없어 저장소 스캔 회수가 거둔다. 흔적은 WARN 로그로 남는지 본다.
 */
@ExtendWith(OutputCaptureExtension.class)
class AdminUserDeleteFileFailureTest extends AbstractPgIntegrationTest {

	@MockitoSpyBean
	FileStorage fileStorage;

	@Test
	void file_delete_failure_still_returns_no_content(CapturedOutput output) {
		String adminToken = createAdminUser("del-fail-admin@b.com");
		String targetToken = createUser("del-fail@b.com");
		UUID target = userId("del-fail@b.com");
		assertThat(rest.postForEntity("/api/files", multipart(targetToken, "a.png", PNG_MAGIC, MediaType.IMAGE_PNG),
				String.class).getStatusCode()).isEqualTo(HttpStatus.OK);
		doThrow(new IllegalStateException("disk boom")).when(fileStorage).delete(anyString());

		var res = rest.exchange("/api/admin/users/" + target, HttpMethod.DELETE,
				new HttpEntity<>(bearer(adminToken)), String.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
		assertThat(jdbc.queryForObject("select count(*) from users where id = ?", Integer.class, target)).isZero();
		assertThat(output).contains("사용자 삭제 후 첨부 파일 정리 실패").contains("disk boom");
	}
}
