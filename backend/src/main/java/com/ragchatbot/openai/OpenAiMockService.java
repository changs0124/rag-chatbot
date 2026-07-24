package com.ragchatbot.openai;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

/**
 * 목업 OpenAI (APP_MODE=mock 기본). 실 API/키 없이 전 경로가 동작함(P-2, AC-5).
 * 고정 코퍼스 키워드에 매칭되면 출처 포함 답변, 아니면 무자료 접두(P-8, AC-6).
 * 호출을 기록해 AC-12·AC-14 검증을 가능케 함.
 */
@Service
@ConditionalOnProperty(prefix = "app", name = "mode", havingValue = "mock", matchIfMissing = true)
public class OpenAiMockService implements OpenAiService {

	/** 무자료 규정 접두(P-8) */
	public static final String NO_SOURCE_PREFIX = "자료 없음 - 관련 자료를 찾지 못했지만, 다음과 같이 추론함: ";

	/** 목업 고정 코퍼스 키워드 */
	private static final List<String> CORPUS_KEYWORDS = List.of("환불", "배송", "정책", "가격", "이용", "약관");

	// 기록(테스트 검증용)
	private final AtomicInteger streamChatCalls = new AtomicInteger();
	private final AtomicInteger deleteResourcesCalls = new AtomicInteger();
	private volatile int lastAttachmentCount = 0;

	@Override
	public ChatCompletion streamChat(ChatInput input, Consumer<String> onToken) {
		streamChatCalls.incrementAndGet();
		lastAttachmentCount = input.attachments() == null ? 0 : input.attachments().size();

		boolean hasImage = input.attachments() != null
				&& input.attachments().stream().anyMatch(a -> "image".equals(a.fileType()));
		String imagePrefix = hasImage ? "(첨부 이미지를 확인함) " : "";

		String message = input.userMessage() == null ? "" : input.userMessage();
		boolean matched = CORPUS_KEYWORDS.stream().anyMatch(message::contains);

		String fullText;
		List<CitationData> citations;
		boolean noSource;
		if (matched) {
			fullText = imagePrefix + "문의하신 내용에 대한 안내는 다음과 같음 [1][2].";
			citations = List.of(
					new CitationData(1, "이용 정책 문서", "정책 관련 발췌 스니펫", "corpus://policy#1"),
					new CitationData(2, "FAQ 문서", "자주 묻는 질문 발췌", "corpus://faq#2"));
			noSource = false;
		} else {
			fullText = imagePrefix + NO_SOURCE_PREFIX + "일반적인 관점에서 이렇게 볼 수 있음.";
			citations = List.of();
			noSource = true;
		}

		// 스트리밍 인터페이스를 실제로 흘려봄(Phase 5 SSE가 이 onToken을 emitter에 연결)
		for (String chunk : fullText.split("(?<=\\G.{8})")) {
			onToken.accept(chunk);
		}
		return new ChatCompletion(fullText, citations, noSource);
	}

	@Override
	public void deleteResources(String vectorStoreId, List<String> openaiFileIds) {
		deleteResourcesCalls.incrementAndGet();
		// 목업 : 실제 삭제 없이 호출만 기록
	}

	public int streamChatCalls() {
		return streamChatCalls.get();
	}

	public int deleteResourcesCalls() {
		return deleteResourcesCalls.get();
	}

	public int lastAttachmentCount() {
		return lastAttachmentCount;
	}
}
