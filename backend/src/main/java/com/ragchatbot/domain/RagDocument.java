package com.ragchatbot.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 공용 Vector Store 에 올린 RAG 문서(FEAT-ADMIN-002).
 *
 * <p>OpenAI 쪽에는 "누가 올렸는가"가 없으므로 저장소가 그 기록을 진다(REQ-ADMIN-002).
 * {@code deleted_at} 으로 <b>소프트 삭제</b>하는 유일한 표다 - "언제 내려갔는가"가 감사 대상이라
 * 행을 지우면 그 사실이 남지 않는다.
 *
 * <p>{@code status} 는 {@code in_progress} · {@code completed} · {@code failed}.
 * <b>업로드 완료와 인덱싱 완료는 다르다</b> - 업로드가 끝나도 파싱이 끝나야 검색에 잡힌다.
 */
public record RagDocument(
		UUID id,
		String filename,
		String openaiFileId,
		String vectorStoreId,
		long byteSize,
		String status,
		UUID uploadedBy,
		OffsetDateTime createdAt,
		OffsetDateTime deletedAt) {
}
