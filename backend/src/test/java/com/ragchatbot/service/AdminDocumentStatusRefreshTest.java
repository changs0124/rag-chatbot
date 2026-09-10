package com.ragchatbot.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.ragchatbot.entity.RagDocument;
import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.repository.RagDocumentRepository;

/**
 * 인덱싱 상태 재조회가 「모름」을 「확정된 실패」로 굳히지 않는지 (#91).
 *
 * <p><b>왜 이 경계가 중요한가</b> — {@code in_progress} 가 아닌 행은
 * {@link RagDocumentRepository#findInProgressIds} 가 다시 묻지 않는다. 그래서 조회 실패를 한 번이라도
 * {@code failed} 로 굳히면 <b>영구히 되돌릴 수 없다.</b> 색인이 정상 완료돼 검색에 잡히고 답변에
 * 인용되는 문서가 관리 화면에는 영원히 「실패」로 뜬다.
 *
 * <p><b>왜 단위 테스트인가</b> — OpenAI 조회 실패를 결정적으로 만들 수 있는 자리가 여기뿐이다.
 * {@code AdminDocumentUploadCompensationTest} 와 같은 이유·같은 방식이다.
 */
class AdminDocumentStatusRefreshTest {

	private static final UUID DOC_ID = UUID.randomUUID();
	private static final String FILE_ID = "file-abc";
	private static final String STORE_ID = "vs-shared";

	private static RagDocument inProgress() {
		return new RagDocument(DOC_ID, "규정.pdf", FILE_ID, STORE_ID, 1024, "in_progress",
				UUID.randomUUID(), null, null);
	}

	private static RagDocumentRepository repoWithInProgressDoc() {
		RagDocumentRepository repo = mock(RagDocumentRepository.class);
		when(repo.findInProgressIds()).thenReturn(List.of(DOC_ID));
		when(repo.findAliveById(DOC_ID)).thenReturn(Optional.of(inProgress()));
		when(repo.listAlive()).thenReturn(List.of());
		return repo;
	}

	/**
	 * 이 이슈의 핵심 — 조회를 못 했으면 아무것도 굳히지 않는다.
	 *
	 * <p>{@code in_progress} 로 남아야 다음 조회에서 다시 묻는다.
	 */
	@Test
	void unknown_status_is_not_persisted() {
		RagDocumentRepository repo = repoWithInProgressDoc();
		OpenAiService openAi = mock(OpenAiService.class);
		when(openAi.documentStatus(anyString(), anyString())).thenReturn(null); // 조회 실패 = 모름

		new AdminDocumentService(repo, openAi).list();

		// **anyString() 을 쓰지 않는다.** Mockito 의 anyString() 은 null 인자를 매칭하지 않아,
		// null 가드가 사라져 updateStatus(id, null) 이 불려도 이 단언이 통과한다(실측 확인).
		// 잡으려는 것이 바로 그 호출이므로 any() 여야 한다
		verify(repo, never()).updateStatus(any(), any());
	}

	/**
	 * 반대편 — OpenAI 가 <b>실패를 명시한 것</b>은 종전대로 굳힌다.
	 *
	 * <p>이 케이스가 없으면 「아무것도 굳히지 않는 구현」이 위 케이스를 통과한다. 그리고 진짜 실패한
	 * 색인이 매 조회마다 다시 물어지며 영원히 {@code in_progress} 로 남는 반대 방향의 결함이 생긴다.
	 */
	@Test
	void explicit_failure_is_still_persisted() {
		RagDocumentRepository repo = repoWithInProgressDoc();
		OpenAiService openAi = mock(OpenAiService.class);
		when(openAi.documentStatus(anyString(), anyString())).thenReturn("failed");

		new AdminDocumentService(repo, openAi).list();

		verify(repo).updateStatus(DOC_ID, "failed");
	}

	/** 완료도 종전대로 굳는다 */
	@Test
	void completed_status_is_persisted() {
		RagDocumentRepository repo = repoWithInProgressDoc();
		OpenAiService openAi = mock(OpenAiService.class);
		when(openAi.documentStatus(anyString(), anyString())).thenReturn("completed");

		new AdminDocumentService(repo, openAi).list();

		verify(repo).updateStatus(DOC_ID, "completed");
	}

	/**
	 * 삭제는 <b>DB 를 먼저</b> 건드린다 (#98).
	 *
	 * <p>DB 가 던지면 OpenAI 쪽은 손대지 않아야 한다 — 순서가 반대였을 때는 「스토어에서는 빠졌는데
	 * 행은 살아 있는」 상태가 남아, 목록에는 보이는데 검색에는 안 잡혔다. 관리자는 아직 색인돼
	 * 있다고 읽는다.
	 */
	@Test
	void delete_does_not_touch_openai_when_db_fails() {
		RagDocumentRepository repo = mock(RagDocumentRepository.class);
		when(repo.findAliveById(DOC_ID)).thenReturn(Optional.of(inProgress()));
		when(repo.softDelete(any(), any())).thenThrow(new IllegalStateException("DB 커넥션 끊김"));
		OpenAiService openAi = mock(OpenAiService.class);

		assertThatThrownBy(() -> new AdminDocumentService(repo, openAi).delete(DOC_ID))
				.isInstanceOf(IllegalStateException.class);

		verify(openAi, never()).deleteDocument(anyString(), anyString());
	}

	/** 반대편 - DB 가 성공하면 OpenAI 쪽도 정리한다 */
	@Test
	void delete_removes_from_openai_after_db_succeeds() {
		RagDocumentRepository repo = mock(RagDocumentRepository.class);
		when(repo.findAliveById(DOC_ID)).thenReturn(Optional.of(inProgress()));
		when(repo.softDelete(any(), any())).thenReturn(1);
		OpenAiService openAi = mock(OpenAiService.class);

		new AdminDocumentService(repo, openAi).delete(DOC_ID);

		verify(openAi).deleteDocument(STORE_ID, FILE_ID);
	}

	/** 값이 그대로면 쓰지 않는다 - 종전 동작을 잃지 않았는지 */
	@Test
	void unchanged_status_is_not_rewritten() {
		RagDocumentRepository repo = repoWithInProgressDoc();
		OpenAiService openAi = mock(OpenAiService.class);
		when(openAi.documentStatus(anyString(), anyString())).thenReturn("in_progress");

		new AdminDocumentService(repo, openAi).list();

		verify(repo, never()).updateStatus(any(), anyString());
	}
}
