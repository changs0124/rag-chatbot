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
	 * 진행 단계 키(R-11). 키는 Mock/Real 공통이고 <b>라벨 문자열은 구현이 소유함</b>(P-2 : ChatService는 모드를 알지 않음).
	 * ANALYZING은 ChatService가 meta 직후 발행하고, SEARCHING·GENERATING은 구현이 자기 경계에서 올림.
	 */
	enum Stage {
		ANALYZING, SEARCHING, GENERATING
	}

	/** 단계 라벨. 목업은 목 데이터임이 드러나는 전용 문구를 씀(P-10) */
	String stageLabel(Stage stage);

	/**
	 * 스트리밍 채팅. 토큰을 onToken으로 흘리고(Phase 5 SSE 연결) 완료 시 결과 반환.
	 * onStage는 실제로 통과한 경계에서만 호출함 - 근거가 없으면 그 단계를 보내지 않음(P-10, R-11).
	 * OpenAI 실 호출은 여기 뒤에만 존재함(P-1 키 비노출).
	 */
	ChatCompletion streamChat(ChatInput input, Consumer<String> onToken, Consumer<Stage> onStage);

	/** 대화 삭제 시 OpenAI 파일/Vector Store 정리(AC-12). Mock은 호출을 기록만 함 */
	void deleteResources(String vectorStoreId, List<String> openaiFileIds);
}
