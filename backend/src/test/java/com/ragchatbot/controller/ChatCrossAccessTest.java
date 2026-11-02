package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.ragchatbot.openai.OpenAiMockService;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 채팅 경로에서 남의 대화 · 첨부를 쓰면 막히는지 (#555).
 *
 * <p>{@code ConversationCrossAccessTest} · {@code FileFlowTest} 는 대화 CRUD 와 파일 서빙만 본다.
 * {@code POST /api/chat} 의 {@code user_id} 조건(대화 : {@code requireOwnedLocked}, 첨부 :
 * {@code findByIdAndUser})이 풀리면 남의 이미지가 모델로 나가고 내 메시지에 연결되는데, 지키는 테스트가 없었다.
 *
 * <p>모델 호출 여부는 목이 마지막 호출에서 기록한 값이 <b>그대로인지</b>로 본다. 먼저 정상 요청으로 값을 채워 두어야
 * 「호출 안 됨」과 「초기값」이 구분된다.
 */
class ChatCrossAccessTest extends AbstractPgIntegrationTest {

	@Autowired
	private OpenAiMockService mock;

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private String uploadImage(String token) {
		var res = rest.postForEntity("/api/files", multipart(token, "a.png", PNG_MAGIC, MediaType.IMAGE_PNG), Map.class);
		String url = (String) res.getBody().get("url");
		return url.substring(url.indexOf("/api/files/") + 11, url.indexOf('?'));
	}

	private ResponseEntity<String> chat(String token, Map<String, Object> body) {
		return rest.exchange("/api/chat", HttpMethod.POST, new HttpEntity<>(body, bearer(token)), String.class);
	}

	@Test
	void chatting_into_another_users_conversation_is_404_and_saves_nothing() {
		String owner = createUser("chat-x-owner@b.com");
		String stranger = createUser("chat-x-stranger@b.com");
		String ownerConv = createConversation(owner);
		// 모델 호출 기록을 비어 있지 않은 값으로 채운다 - 이후 호출되면 값이 바뀐다
		String ownConv = createConversation(stranger);
		chat(stranger, Map.of("conversationId", ownConv, "message", "첫 질문"));
		chat(stranger, Map.of("conversationId", ownConv, "message", "둘째 질문"));
		var before = mock.lastHistory();
		assertThat(before).isNotEmpty();

		var res = chat(stranger, Map.of("conversationId", ownerConv, "message", "침입"));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(jdbc.queryForObject("select count(*) from messages where conversation_id = ?::uuid",
				Integer.class, ownerConv)).isZero();
		assertThat(mock.lastHistory()).isSameAs(before);
	}

	@Test
	void chatting_with_another_users_attachment_is_404_and_links_nothing() {
		String owner = createUser("chat-xa-owner@b.com");
		String stranger = createUser("chat-xa-stranger@b.com");
		String ownerAtt = uploadImage(owner);
		String convId = createConversation(stranger);
		// 모델 호출 기록을 0장으로 채운다 - 남의 이미지가 실려 나가면 1 이 된다
		chat(stranger, Map.of("conversationId", convId, "message", "첫 질문"));
		assertThat(mock.lastAttachmentCount()).isZero();
		int messagesBefore = jdbc.queryForObject("select count(*) from messages where conversation_id = ?::uuid",
				Integer.class, convId);

		var res = chat(stranger, Map.of("conversationId", convId, "message", "이거 뭐야",
				"attachmentIds", List.of(ownerAtt)));

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(jdbc.queryForObject("select count(*) from attachments where id = ?::uuid and message_id is null",
				Integer.class, ownerAtt)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from messages where conversation_id = ?::uuid",
				Integer.class, convId)).isEqualTo(messagesBefore);
		assertThat(mock.lastAttachmentCount()).isZero();
	}
}
