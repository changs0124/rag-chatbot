package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 비었을 때만 지우는 대화 삭제(#447).
 *
 * <p>화면은 200 전에 끊긴 새 대화를 이 삭제로 치운다(#440). 조건 없이 지우면 서버가 막 커밋한 질문 · 첨부를 cascade 로
 * 지운다 - 확인과 삭제 사이에 틈이 있었다. 실 PostgreSQL 이라야 잠금 순서가 재현된다.
 */
class ConversationDeleteIfEmptyTest extends AbstractPgIntegrationTest {

	@Autowired
	DataSource dataSource;

	private HttpStatus deleteIfEmpty(String token, String convId) {
		return HttpStatus.valueOf(rest.exchange("/api/conversations/" + convId + "?ifEmpty=true", HttpMethod.DELETE,
				new HttpEntity<>(bearer(token)), Map.class).getStatusCode().value());
	}

	/**
	 * 다른 요청이 행 잠금에서 기다리기 시작할 때까지 기다린다 - 고정 sleep 은 요청이 잠금에 닿기 전에 지나가도 통과해,
	 * 「기다렸다가」를 증명하지 못한다(리뷰 지적). 같은 계정의 세션이라 런타임 계정으로도 보인다
	 */
	private void awaitLockWait() throws InterruptedException {
		for (int i = 0; i < 100; i++) {
			Integer waiting = jdbc.queryForObject(
					"select count(*) from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()",
					Integer.class);
			if (waiting != null && waiting > 0) {
				return;
			}
			Thread.sleep(50);
		}
		throw new AssertionError("5초 안에 잠금 대기가 생기지 않음");
	}

	private int messages(String convId) {
		return jdbc.queryForObject("select count(*) from messages where conversation_id = ?", Integer.class,
				UUID.fromString(convId));
	}

	private int conversations(String convId) {
		return jdbc.queryForObject("select count(*) from conversations where id = ?", Integer.class,
				UUID.fromString(convId));
	}

	@Test
	void empty_conversation_is_deleted() {
		String token = createUser("if-empty-empty@b.com");
		String convId = createConversation(token);

		assertThat(deleteIfEmpty(token, convId)).isEqualTo(HttpStatus.NO_CONTENT);
		assertThat(conversations(convId)).isZero();
	}

	@Test
	void conversation_with_message_is_kept_with_409() {
		String token = createUser("if-empty-has-msg@b.com");
		String convId = createConversation(token);
		jdbc.update("insert into messages (id, conversation_id, role, content, status) values (?, ?, 'user', '질문', 'complete')",
				UUID.randomUUID(), UUID.fromString(convId));

		assertThat(deleteIfEmpty(token, convId)).isEqualTo(HttpStatus.CONFLICT);
		assertThat(conversations(convId)).isOne();
		assertThat(messages(convId)).isOne();
	}

	/**
	 * 채팅 준비가 질문을 넣고 아직 커밋하지 않은 사이에 지우면 - 커밋을 기다렸다가 409, 질문은 남는다.
	 *
	 * <p>변경 전에는 조건이 없어 그 커밋 뒤에 cascade 로 지웠다(204 · 질문 0개). 화면이 「없음」으로 본 직후의 삭제가 이 경로다.
	 */
	@Test
	void delete_racing_an_uncommitted_question_waits_and_keeps_it() throws Exception {
		String token = createUser("if-empty-race@b.com");
		String convId = createConversation(token);

		try (Connection prepare = dataSource.getConnection()) {
			prepare.setAutoCommit(false);
			try (PreparedStatement ps = prepare.prepareStatement(
					"insert into messages (id, conversation_id, role, content, status) values (?, ?, 'user', '질문', 'complete')")) {
				ps.setObject(1, UUID.randomUUID());
				ps.setObject(2, UUID.fromString(convId));
				ps.executeUpdate();
			}
			CompletableFuture<HttpStatus> delete = CompletableFuture.supplyAsync(() -> deleteIfEmpty(token, convId));
			awaitLockWait(); // 삭제가 질문 삽입의 외래 키 잠금에서 기다린다
			assertThat(delete).isNotDone();
			prepare.commit();

			assertThat(delete.get(10, TimeUnit.SECONDS)).isEqualTo(HttpStatus.CONFLICT);
		}
		assertThat(conversations(convId)).isOne();
		assertThat(messages(convId)).isOne();
	}

	/**
	 * 삭제가 먼저 잠근 사이에 도착한 채팅은 기다렸다가 404 - 아무것도 저장하지 않는다.
	 *
	 * <p>채팅 준비의 소유 확인이 잠그지 않으면 확인을 통과한 뒤 질문 삽입이 외래 키에서 기다리다가, 삭제가 커밋되면
	 * 외래 키 위반(500)으로 끝났다(리뷰 지적 - 이 테스트가 그 잠금을 지킨다).
	 */
	@Test
	void chat_racing_a_delete_that_holds_the_lock_gets_404() throws Exception {
		String token = createUser("if-empty-delete-first@b.com");
		String convId = createConversation(token);

		try (Connection delete = dataSource.getConnection()) {
			delete.setAutoCommit(false);
			try (PreparedStatement ps = delete.prepareStatement("select id from conversations where id = ? for update")) {
				ps.setObject(1, UUID.fromString(convId));
				ps.executeQuery().close();
			}
			CompletableFuture<Integer> chat = CompletableFuture.supplyAsync(() -> rest.exchange("/api/chat",
					HttpMethod.POST, new HttpEntity<>(Map.of("conversationId", convId, "message", "경합 질문"), bearer(token)),
					String.class).getStatusCode().value());
			awaitLockWait(); // 채팅 준비가 대화 행 잠금에서 기다린다
			try (PreparedStatement ps = delete.prepareStatement("delete from conversations where id = ?")) {
				ps.setObject(1, UUID.fromString(convId));
				ps.executeUpdate();
			}
			delete.commit();

			assertThat(chat.get(10, TimeUnit.SECONDS)).isEqualTo(404);
		}
		assertThat(messages(convId)).isZero();
	}

	/** 남의 대화는 비어 있어도 404 - 소유 확인은 조건부 삭제에도 같다(P-3) */
	@Test
	void other_users_conversation_is_hidden() {
		String owner = createUser("if-empty-owner@b.com");
		String other = createUser("if-empty-other@b.com");
		String convId = createConversation(owner);

		assertThat(deleteIfEmpty(other, convId)).isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(conversations(convId)).isOne();
	}

	/** 지운 뒤에 도착한 채팅은 대화가 없어 404 - 아무것도 저장하지 않는다 */
	@Test
	void chat_after_delete_finds_nothing() {
		String token = createUser("if-empty-late-chat@b.com");
		String convId = createConversation(token);
		assertThat(deleteIfEmpty(token, convId)).isEqualTo(HttpStatus.NO_CONTENT);

		var res = rest.exchange("/api/chat", HttpMethod.POST,
				new HttpEntity<>(Map.of("conversationId", convId, "message", "늦게 온 질문"), bearer(token)), String.class);

		assertThat(res.getStatusCode().value()).isEqualTo(404);
		assertThat(messages(convId)).isZero();
	}
}
