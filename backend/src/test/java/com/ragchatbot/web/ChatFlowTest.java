package com.ragchatbot.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
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

import com.ragchatbot.openai.OpenAiMockService;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * Phase 4 : 목업 채팅 경계. AC-5(호출0/목업) · AC-6(무자료) · AC-7(출처 저장·재조회) ·
 * AC-12(삭제 시 OpenAI 정리 호출) · AC-14(첨부 전달) · AC-21(이미지 단독).
 */
class ChatFlowTest extends AbstractPgIntegrationTest {

	@Autowired
	private OpenAiMockService mock;

	private static final byte[] PNG = { (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0 };

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private String createConversation(String token) {
		var res = rest.exchange("/api/conversations", HttpMethod.POST,
				new HttpEntity<>(Map.of("title", "채팅"), bearer(token)), Map.class);
		return (String) res.getBody().get("id");
	}

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private String uploadImage(String token) {
		var partHeaders = new HttpHeaders();
		partHeaders.setContentType(MediaType.IMAGE_PNG);
		var resource = new ByteArrayResource(PNG) {
			@Override
			public String getFilename() {
				return "a.png";
			}
		};
		var body = new LinkedMultiValueMap<String, Object>();
		body.add("file", new HttpEntity<>(resource, partHeaders));
		var headers = bearer(token);
		headers.setContentType(MediaType.MULTIPART_FORM_DATA);
		var res = rest.postForEntity("/api/files", new HttpEntity<>(body, headers), Map.class);
		String url = (String) res.getBody().get("url");
		return url.substring(url.indexOf("/api/files/") + 11, url.indexOf('?'));
	}

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private org.springframework.http.ResponseEntity<Map> chat(String token, Map<String, Object> body) {
		return rest.exchange("/api/chat", HttpMethod.POST, new HttpEntity<>(body, bearer(token)), Map.class);
	}

	@Test
	@SuppressWarnings("unchecked")
	void known_topic_returns_citations_and_persists() {
		String token = signup("chat-known@b.com");
		String convId = createConversation(token);

		var res = chat(token, Map.of("conversationId", convId, "message", "환불 정책 알려줘"));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat((Boolean) res.getBody().get("noSource")).isFalse();
		assertThat((List<?>) res.getBody().get("citations")).isNotEmpty();

		// AC-7 : 재조회 시 출처 유지
		var messages = rest.exchange("/api/conversations/" + convId + "/messages", HttpMethod.GET,
				new HttpEntity<>(bearer(token)), List.class);
		List<Map<String, Object>> list = messages.getBody();
		var assistant = list.stream().filter(m -> "assistant".equals(m.get("role"))).findFirst().orElseThrow();
		assertThat((List<?>) assistant.get("citations")).isNotEmpty();
	}

	@Test
	void unknown_topic_is_no_source() {
		String token = signup("chat-unknown@b.com");
		String convId = createConversation(token);
		var res = chat(token, Map.of("conversationId", convId, "message", "우주의 크기는 얼마나 되나"));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat((Boolean) res.getBody().get("noSource")).isTrue();
		assertThat((List<?>) res.getBody().get("citations")).isEmpty();
		assertThat((String) res.getBody().get("content")).contains("자료 없음");
	}

	@Test
	void image_only_message_allowed_and_passed() {
		String token = signup("chat-img@b.com");
		String convId = createConversation(token);
		String attId = uploadImage(token);

		var res = chat(token, Map.of("conversationId", convId, "message", "", "attachmentIds", List.of(attId)));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK); // AC-21
		assertThat(mock.lastAttachmentCount()).isEqualTo(1); // AC-14
	}

	@Test
	void delete_conversation_calls_openai_cleanup() {
		String token = signup("chat-del@b.com");
		String convId = createConversation(token);
		chat(token, Map.of("conversationId", convId, "message", "가격 문의"));

		int before = mock.deleteResourcesCalls();
		var del = rest.exchange("/api/conversations/" + convId, HttpMethod.DELETE,
				new HttpEntity<>(bearer(token)), Void.class);
		assertThat(del.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
		assertThat(mock.deleteResourcesCalls()).isGreaterThan(before); // AC-12
	}

	@Test
	void empty_message_no_attachment_400() {
		String token = signup("chat-empty@b.com");
		String convId = createConversation(token);
		var res = chat(token, Map.of("conversationId", convId, "message", ""));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}
}
