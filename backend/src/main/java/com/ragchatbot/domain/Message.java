package com.ragchatbot.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 메시지.
 *
 * <p>{@code stopped} 는 <b>사용자가 스트림을 끊어 도중에 끝났음</b>을 뜻함. 상태(status)는 결정대로
 * {@code complete} 로 두되(중단은 실패가 아님), 출처 판정이 끝나지 않았다는 사실을 여기에 남김 -
 * 무자료 배너가 "출처 0건"만 보고 붙으면 중단된 답변에 거짓으로 붙기 때문임.
 */
public record Message(
		UUID id,
		UUID conversationId,
		String role,
		String content,
		String status,
		boolean stopped,
		OffsetDateTime createdAt) {
}
