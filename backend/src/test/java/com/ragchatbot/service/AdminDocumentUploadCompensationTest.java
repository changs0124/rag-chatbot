package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.openai.OpenAiService.UploadedDocument;
import com.ragchatbot.repository.RagDocumentRepository;

/**
 * 업로드 보상(#72). OpenAI 에 올린 <b>뒤</b> DB 에 기록하므로, 그 사이가 끊기면 되돌릴 사람이 없다.
 *
 * <p><b>왜 단위 테스트인가</b> — 통합 테스트로는 DB insert 실패를 결정적으로 만들 수 없다.
 * 실패를 주입할 수 있는 자리가 여기뿐이라, 이 계약은 여기서 잠근다.
 * {@code OrphanCleanupSchedulerTest} 와 같은 이유·같은 방식이다.
 */
class AdminDocumentUploadCompensationTest {

	private static final String FILE_ID = "file-abc";
	private static final String STORE_ID = "vs-shared";

	private static MockMultipartFile pdf() {
		return new MockMultipartFile("file", "규정.pdf", "application/pdf",
				"%PDF-1.4 본문".getBytes(StandardCharsets.UTF_8));
	}

	/** 업로드는 성공했다고 두고, 그 뒤 단계만 갈아 끼운다 */
	private static OpenAiService openAiStub() {
		OpenAiService openAi = mock(OpenAiService.class);
		when(openAi.hasSharedVectorStore()).thenReturn(true);
		when(openAi.uploadDocument(anyString(), any(), anyString()))
				.thenReturn(new UploadedDocument(FILE_ID, STORE_ID));
		return openAi;
	}

	/**
	 * DB 기록이 실패하면 OpenAI 쪽을 되돌린다.
	 *
	 * <p>되돌리지 않으면 스토어에는 있는데 관리 화면에는 없는 문서가 된다 — 보이지 않아 지울 수 없고,
	 * 검색에는 잡혀 <b>삭제한 적 없는 문서가 답변 근거로 계속 인용된다.</b>
	 * 고아 회수 스케줄러는 로컬 첨부만 보므로 기다려도 사라지지 않는다.
	 */
	@Test
	void rolls_back_openai_side_when_db_insert_fails() {
		OpenAiService openAi = openAiStub();
		RagDocumentRepository repo = mock(RagDocumentRepository.class);
		doThrow(new IllegalStateException("DB 기록 실패")).when(repo).insert(any());

		var service = new AdminDocumentService(repo, openAi);

		assertThatThrownBy(() -> service.upload(UUID.randomUUID(), pdf()))
				.withFailMessage("원래 예외를 삼키면 관리자가 업로드 실패를 모른다")
				.isInstanceOf(IllegalStateException.class);

		verify(openAi).deleteDocument(STORE_ID, FILE_ID);
	}

	/**
	 * <b>재조회 실패에는 보상하지 않는다.</b> insert 는 이미 성공한 상태라, 여기서 OpenAI 파일을 지우면
	 * 「행은 있는데 파일이 없는」 <b>반대 방향의 불일치</b>가 된다. 보상 범위가 새지 않는지 잠근다.
	 */
	@Test
	void does_not_roll_back_when_only_the_read_back_fails() {
		OpenAiService openAi = openAiStub();
		RagDocumentRepository repo = mock(RagDocumentRepository.class);
		// insert 는 통과. 방금 넣은 행이 목록에 없으면 :159 가 던진다
		when(repo.listAlive()).thenReturn(List.of());

		var service = new AdminDocumentService(repo, openAi);

		assertThatThrownBy(() -> service.upload(UUID.randomUUID(), pdf()))
				.isInstanceOf(IllegalStateException.class);

		verify(openAi, never()).deleteDocument(anyString(), anyString());
	}
}
