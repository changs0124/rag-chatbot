package com.ragchatbot.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 메시지.
 *
 * <p>{@code stopped} 는 <b>사용자가 스트림을 끊어 도중에 끝났음</b>을 뜻함. 상태(status)는 결정대로
 * {@code complete} 로 두되(중단은 실패가 아님), 출처 판정이 끝나지 않았다는 사실을 여기에 남김 -
 * 무자료 배너가 "출처 0건"만 보고 붙으면 중단된 답변에 거짓으로 붙기 때문임.
 *
 * <p>{@code inputTokens}·{@code outputTokens} 는 <b>null 이 될 수 있음</b>(FEAT-OPS-001). 사용자 메시지 ·
 * 목업 응답 · 중단으로 usage 가 오기 전에 끝난 턴 · V4 이전 행에는 값이 없음. 0 이 아니라 null 이어야
 * "모르는 것"과 "정말 0"이 합계에서 섞이지 않음. 그래서 primitive 가 아니라 {@link Integer} 임.
 */
public record Message(
		UUID id,
		UUID conversationId,
		String role,
		String content,
		String status,
		boolean stopped,
		Integer inputTokens,
		Integer outputTokens,
		OffsetDateTime createdAt) {
}
