package com.ragchatbot.entity;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 목록 화면용 투영(FEAT-ADMIN-002). {@link RagDocument} + 올린 사람 이름.
 *
 * <p>문서마다 이름을 따로 조회하면 N+1 이 된다 - 이 저장소는 출처 조회에서 같은 문제를 한 번
 * 겪고 고쳤다. 조인 한 번으로 끝내려고 별도 투영을 둔다.
 *
 * <p><b>이메일을 담지 않는다.</b> 관리 화면에 필요하지 않은 개인정보를 늘리지 않는다.
 */
public record RagDocumentSummary(
		UUID id,
		String filename,
		long byteSize,
		String status,
		String uploadedByName,
		OffsetDateTime createdAt) {
}
