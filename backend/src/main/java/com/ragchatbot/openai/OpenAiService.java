package com.ragchatbot.openai;

import java.util.List;
import java.util.function.Consumer;

/**
 * OpenAI 호출 경계(P-2). Mock/Real 두 구현을 APP_MODE로 전환함.
 * 실 연동 시 이 인터페이스 뒤(OpenAiRealService)만 실 응답에 맞춰 마무리하면 됨(M2 스파이크).
 */
public interface OpenAiService {

	/** 첨부 참조 (비전 이미지 / RAG 문서) */
	record AttachmentRef(String fileType, String storagePath, String openaiFileId) {
	}

	/** 채팅 입력 */
	record ChatInput(String userMessage, List<AttachmentRef> attachments, String vectorStoreId) {
	}

	/** 출처 데이터 (응답 annotations 에 대응) */
	record CitationData(int seq, String sourceName, String snippet, String uri) {
	}

	/** 채팅 결과. noSource=true면 무자료(citations 비어 있고 응답에 규정 접두, P-8) */
	record ChatCompletion(String fullText, List<CitationData> citations, boolean noSource) {
	}

	/**
	 * 스트리밍 채팅. 토큰을 onToken으로 흘리고(Phase 5 SSE 연결) 완료 시 결과 반환.
	 * OpenAI 실 호출은 여기 뒤에만 존재함(P-1 키 비노출).
	 */
	ChatCompletion streamChat(ChatInput input, Consumer<String> onToken);

	/** 대화 삭제 시 OpenAI 파일/Vector Store 정리(AC-12). Mock은 호출을 기록만 함 */
	void deleteResources(String vectorStoreId, List<String> openaiFileIds);
}
