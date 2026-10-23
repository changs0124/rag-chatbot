package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 사용자별 첨부 저장 한도(#418). 분당 상한(#95)과 장수 상한(#401)은 쌓이는 속도만 줄여, 한 사용자가
 * uploads 볼륨을 채우면 같은 디스크의 Postgres 가 먼저 멎는다. 한도는 사용자 폴더의 실제 파일 크기 합이다.
 *
 * <p>한도를 1MB 로 낮추고 600KB 짜리 PNG 를 두 번 올린다 - 첫 장은 통과, 둘째 장은 디스크에 쓰기 전에 400.
 */
@TestPropertySource(properties = "app.file.attachment-quota-mb=1")
class AttachmentQuotaTest extends AbstractPgIntegrationTest {

	@Value("${app.file.storage-root}")
	private String storageRoot;

	/** PNG 매직 + 600KB 패딩 - 두 장이면 1MB 를 넘는다 */
	private static final byte[] PNG_600K = new byte[600 * 1024];

	static {
		System.arraycopy(PNG_MAGIC, 0, PNG_600K, 0, PNG_MAGIC.length);
	}

	@SuppressWarnings("rawtypes")
	private ResponseEntity<Map> upload(String token) {
		return rest.postForEntity("/api/files", multipart(token, "a.png", PNG_600K, MediaType.IMAGE_PNG), Map.class);
	}

	private long filesOf(UUID userId) throws Exception {
		Path dir = Path.of(storageRoot).resolve(userId.toString());
		if (!Files.isDirectory(dir)) {
			return 0;
		}
		try (Stream<Path> s = Files.list(dir)) {
			return s.filter(Files::isRegularFile).count();
		}
	}

	private long rowsOf(UUID userId) {
		return jdbc.queryForObject("select count(*) from attachments where user_id = ?", Long.class, userId);
	}

	@Test
	@SuppressWarnings("rawtypes")
	void over_quota_upload_is_400_and_writes_nothing() throws Exception {
		String email = "quota-a@b.com";
		String token = createUser(email);
		UUID userId = userId(email);

		assertThat(upload(token).getStatusCode()).isEqualTo(HttpStatus.OK);

		ResponseEntity<Map> res = upload(token);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat((String) res.getBody().get("message")).contains("첨부 저장 한도 초과").contains("1MB");
		assertThat(filesOf(userId)).isEqualTo(1);
		assertThat(rowsOf(userId)).isEqualTo(1);
	}

	/** 지운 첨부만큼 다시 올릴 수 있다 - 한도는 누적 횟수가 아니라 지금 남아 있는 파일 크기다 */
	@Test
	@SuppressWarnings("rawtypes")
	void deleting_an_attachment_frees_quota() {
		String token = createUser("quota-b@b.com");
		ResponseEntity<Map> first = upload(token);
		assertThat(first.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(upload(token).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

		String url = (String) first.getBody().get("url");
		String id = url.substring(url.indexOf("/api/files/") + 11, url.indexOf('?'));
		var del = rest.exchange("/api/files/" + id, HttpMethod.DELETE, new HttpEntity<>(bearer(token)), Void.class);
		assertThat(del.getStatusCode().is2xxSuccessful()).isTrue();

		assertThat(upload(token).getStatusCode()).isEqualTo(HttpStatus.OK);
	}

	/** 한도는 사용자별이다 - 다른 사용자가 한도에 닿아도 내 업로드는 통과한다 */
	@Test
	void quota_is_per_user() {
		String full = createUser("quota-c@b.com");
		assertThat(upload(full).getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(upload(full).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

		assertThat(upload(createUser("quota-d@b.com")).getStatusCode()).isEqualTo(HttpStatus.OK);
	}
}
