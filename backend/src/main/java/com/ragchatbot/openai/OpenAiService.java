package com.ragchatbot.openai;

import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * OpenAI 호출 경계(P-2). Mock/Real 두 구현을 APP_MODE로 전환함.
 * 실 연동 시 이 인터페이스 뒤(OpenAiRealService)만 실 응답에 맞춰 마무리하면 됨(M2 스파이크).
 */
public interface OpenAiService {

	/** 첨부 참조 (비전 이미지 / RAG 문서) */
	record AttachmentRef(String fileType, String storagePath, String openaiFileId) {
	}

	/**
	 * 이전 대화 한 턴. <b>텍스트만</b> 담음 - 과거 이미지는 재전송하지 않고 자리표시자로 남김
	 * (이미지 하나가 수천 토큰이라 턴이 쌓일수록 비용이 폭증함).
	 */
	record Turn(String role, String content) {
	}

	/**
	 * 채팅 입력.
	 *
	 * @param history 이전 턴들. <b>오래된 것부터</b>의 순서이며 이번 사용자 메시지는 포함하지 않음.
	 *                토큰 예산 안에서 잘려 있음(ChatService 가 자름)
	 */
	record ChatInput(String userMessage, List<AttachmentRef> attachments, String vectorStoreId, List<Turn> history) {
	}

	/** 출처 데이터 (응답 annotations 에 대응) */
	record CitationData(int seq, String sourceName, String snippet, String uri) {
	}

	/**
	 * 채팅 결과. noSource=true면 무자료(citations 비어 있고 응답에 규정 접두, P-8).
	 *
	 * <p>{@code inputTokens}·{@code outputTokens} 는 이 턴이 실제로 쓴 토큰 수임(FEAT-OPS-001).
	 * <b>모르면 null</b> - 목업 · usage 필드가 없는 응답 · 중단으로 완료 이벤트 전에 끝난 턴이 그렇다.
	 * 0 으로 채우면 합계에서 "정말 0"과 구분되지 않아 턴당 평균이 거짓이 됨.
	 */
	record ChatCompletion(String fullText, List<CitationData> citations, boolean noSource,
			Integer inputTokens, Integer outputTokens) {
	}

	/**
	 * 진행 단계 키(R-11). 키는 Mock/Real 공통이고 <b>라벨 문자열은 구현이 소유함</b>(P-2 : ChatService는 모드를 알지 않음).
	 * ANALYZING은 ChatService가 meta 직후 발행하고, SEARCHING·GENERATING은 구현이 자기 경계에서 올림.
	 */
	enum Stage {
		ANALYZING, SEARCHING, GENERATING
	}

	/**
	 * 단계 라벨. 목업은 목 데이터임이 드러나는 전용 문구를 씀(P-10).
	 *
	 * @param sources 그 단계가 <b>실제로 참조한</b> 자료명. 참조한 자료가 없거나 그 시점에 아직 알 수 없으면
	 *                빈 리스트임 - 비어 있으면 자료명을 붙이지 않음(없는 자료명을 지어내지 않기 위함, P-10)
	 */
	String stageLabel(Stage stage, List<String> sources);

	/**
	 * 스트리밍 채팅. 토큰을 onToken으로 흘리고(Phase 5 SSE 연결) 완료 시 결과 반환.
	 * onStage는 실제로 통과한 경계에서만 호출함 - 근거가 없으면 그 단계를 보내지 않음(P-10, R-11).
	 * 두 번째 인자는 그 단계가 참조한 자료명이며 근거가 없으면 빈 리스트임.
	 * OpenAI 실 호출은 여기 뒤에만 존재함(P-1 키 비노출).
	 */
	ChatCompletion streamChat(ChatInput input, Consumer<String> onToken, BiConsumer<Stage, List<String>> onStage);

	/** 대화 삭제 시 OpenAI 파일/Vector Store 정리(AC-12). Mock은 호출을 기록만 함 */
	void deleteResources(String vectorStoreId, List<String> openaiFileIds);

	// ── RAG 문서 관리(FEAT-ADMIN-002) ────────────────────────────────────────────
	// 채팅 첨부와 다른 경로임. 첨부는 비전 입력용이라 이미지만 받고 인라인으로 보내지만,
	// 여기는 색인용이라 문서만 받아 공용 Vector Store 에 넣음.

	/** 공용 Vector Store 설정 여부. 비어 있으면 업로드를 받지 않음 - 어디에도 없는 문서가 목록에만 뜨는 것을 막음 */
	boolean hasSharedVectorStore();

	/** 업로드한 문서의 OpenAI 식별자와 그것이 들어간 스토어 */
	record UploadedDocument(String openaiFileId, String vectorStoreId) {
	}

	/**
	 * 문서를 OpenAI Files 에 올리고 공용 Vector Store 에 연결함.
	 *
	 * <p>둘 중 뒤 단계가 실패하면 <b>고아 파일이 남으므로</b> 구현이 즉시 정리를 시도하고,
	 * 그것도 실패하면 경고 로그에 file_id 를 남김. 어느 경우에도 예외를 던져 호출자가
	 * DB 행을 만들지 않게 함.
	 */
	UploadedDocument uploadDocument(String filename, byte[] content, String contentType);

	/** 인덱싱 상태 조회 - in_progress | completed | failed 중 하나를 돌려줌 */
	String documentStatus(String vectorStoreId, String openaiFileId);

	/** Vector Store 연결 해제 + 파일 삭제. 실패해도 예외를 던지지 않음(호출자는 삭제를 계속 진행함) */
	void deleteDocument(String vectorStoreId, String openaiFileId);
}
