package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import com.ragchatbot.dto.ChatDtos.ChatRequest;
import com.ragchatbot.entity.Attachment;
import com.ragchatbot.entity.Conversation;
import com.ragchatbot.exception.ApiExceptions.BadRequestException;
import com.ragchatbot.repository.AttachmentRepository;
import com.ragchatbot.repository.ConversationRepository;
import com.ragchatbot.repository.MessageRepository;
import com.ragchatbot.openai.OpenAiService.AttachmentRef;
import com.ragchatbot.storage.FileStorage;

/**
 * 고아 회수와 전송이 같은 첨부를 두고 겹칠 때(#359).
 *
 * <p>둘 다 「읽고 나서 쓴다」라, 회수가 목록을 읽은 뒤 전송이 그 첨부를 싣거나 전송이 확인한 뒤 회수가 지우는 틈이 있다.
 * 실제 두 스레드를 맞물리기는 어려워 저장소 대역으로 그 틈의 결과(0행)를 직접 만든다.
 */
class AttachmentLinkRaceTest {

	private static final UUID USER = UUID.randomUUID();

	private static Attachment draft(UUID id) {
		return new Attachment(id, null, USER, "u/" + id + ".png", "image", null,
				OffsetDateTime.now().minusHours(2));
	}

	/** 회수가 읽은 뒤 전송에 실려 조건부 삭제가 0행이면, 파일을 지우지 않고 회수 수에도 넣지 않는다 */
	@Test
	void orphan_cleanup_keeps_attachment_linked_after_it_was_listed() {
		var storage = mock(FileStorage.class);
		var repo = mock(AttachmentRepository.class);
		var att = draft(UUID.randomUUID());
		when(repo.findOrphans(any())).thenReturn(List.of(att));
		when(repo.deleteDraftByIdAndUser(att.id(), USER)).thenReturn(0);

		int removed = new FileService(storage, repo, null).cleanupOrphans(OffsetDateTime.now());

		assertThat(removed).isZero();
		verify(storage, never()).delete(any());
	}

	/** 전송이 확인한 뒤 첨부가 사라졌거나 다른 전송에 먼저 실려 연결이 0행이면, 답을 만들지 않고 거절한다 */
	@Test
	void send_rejects_attachment_that_could_not_be_linked() {
		var conversations = mock(ConversationRepository.class);
		var messages = mock(MessageRepository.class);
		var repo = mock(AttachmentRepository.class);
		UUID convId = UUID.randomUUID();
		var att = draft(UUID.randomUUID());
		when(conversations.findByIdAndUser(convId, USER)).thenReturn(Optional.of(
				new Conversation(convId, USER, "t", null, OffsetDateTime.now(), OffsetDateTime.now())));
		when(repo.findByIdAndUser(att.id(), USER)).thenReturn(Optional.of(att));
		when(repo.linkToMessage(any(), any(), any())).thenReturn(0);

		var service = new ChatService(conversations, messages, repo, null, null, 6000);

		assertThatThrownBy(() -> service.prepare(USER, new ChatRequest(convId, "질문", List.of(att.id()))))
				.isInstanceOf(BadRequestException.class);
	}

	/**
	 * 파일 하나를 못 지워도 나머지 고아는 그 회차에 회수한다(#365). 행은 이미 지워졌으므로 남은 파일은
	 * 저장소 스캔 회수({@link FileService#cleanupUnreferencedFiles})가 가져간다.
	 */
	@Test
	void orphan_cleanup_continues_when_a_file_delete_fails() {
		var storage = mock(FileStorage.class);
		var repo = mock(AttachmentRepository.class);
		var broken = draft(UUID.randomUUID());
		var next = draft(UUID.randomUUID());
		when(repo.findOrphans(any())).thenReturn(List.of(broken, next));
		when(repo.deleteDraftByIdAndUser(any(), eq(USER))).thenReturn(1);
		doThrow(new IllegalStateException("디스크 오류")).when(storage).delete(broken.storagePath());

		int removed = new FileService(storage, repo, null).cleanupOrphans(OffsetDateTime.now());

		verify(storage).delete(next.storagePath());
		assertThat(removed).isEqualTo(2); // 행은 둘 다 지워졌다
	}

	/**
	 * 저장소 스캔 회수도 파일 하나를 못 지웠다고 루프째 멈추지 않는다(#367). 못 지운 파일은 그대로 남아
	 * 다음 주기에 다시 대상이 되므로 회수 수에는 넣지 않는다.
	 */
	@Test
	void unreferenced_cleanup_continues_when_a_file_delete_fails() {
		var storage = mock(FileStorage.class);
		var repo = mock(AttachmentRepository.class);
		Instant old = Instant.now().minus(Duration.ofHours(2));
		var broken = new FileStorage.StoredFile("u/broken.png", old);
		var next = new FileStorage.StoredFile("u/next.png", old);
		when(repo.findAllStoragePaths()).thenReturn(List.of());
		when(storage.listAll()).thenReturn(List.of(broken, next));
		doThrow(new IllegalStateException("디스크 오류")).when(storage).delete(broken.storagePath());

		int removed = new FileService(storage, repo, null).cleanupUnreferencedFiles(OffsetDateTime.now());

		verify(storage).delete(next.storagePath());
		assertThat(removed).isEqualTo(1);
	}

	/**
	 * 첨부 연결(UPDATE)은 id 정렬 순서로 한다(#365). 같은 첨부 둘을 반대 순서로 동시에 보내면 행 잠금 순서가
	 * 엇갈려 PG 데드락(500)이 난다. 두 트랜잭션을 실제로 맞물리기는 어려워 <b>연결 호출 순서</b>를 대신 본다.
	 * 모델에 보내는 첨부 순서(refs)는 사용자가 붙인 순서 그대로여야 한다.
	 */
	@Test
	void send_links_attachments_in_id_order_but_keeps_ref_order() {
		var conversations = mock(ConversationRepository.class);
		var messages = mock(MessageRepository.class);
		var repo = mock(AttachmentRepository.class);
		UUID convId = UUID.randomUUID();
		var low = draft(new UUID(0, 1));
		var high = draft(new UUID(0, 2));
		when(conversations.findByIdAndUser(convId, USER)).thenReturn(Optional.of(
				new Conversation(convId, USER, "t", null, OffsetDateTime.now(), OffsetDateTime.now())));
		when(repo.findByIdAndUser(low.id(), USER)).thenReturn(Optional.of(low));
		when(repo.findByIdAndUser(high.id(), USER)).thenReturn(Optional.of(high));
		when(repo.linkToMessage(any(), any(), any())).thenReturn(1);

		var prepared = new ChatService(conversations, messages, repo, null, null, 6000)
				.prepare(USER, new ChatRequest(convId, "질문", List.of(high.id(), low.id())));

		InOrder order = inOrder(repo);
		order.verify(repo).linkToMessage(eq(low.id()), any(), eq(USER));
		order.verify(repo).linkToMessage(eq(high.id()), any(), eq(USER));
		assertThat(prepared.refs()).containsExactly(new AttachmentRef(high.storagePath()),
				new AttachmentRef(low.storagePath()));
	}
}
