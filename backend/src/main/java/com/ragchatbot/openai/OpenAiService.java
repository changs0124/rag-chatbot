package com.ragchatbot.openai;

import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Predicate;

/**
 * OpenAI 호출 경계(P-2). Mock/Real 두 구현을 APP_MODE로 전환함.
 */
public interface OpenAiService {

	/** 첨부 참조 - 비전 이미지(첨부는 이미지뿐이다). mimeType 은 FileService 의 허용 표에서 채운다(#389) */
	record AttachmentRef(String storagePath, String mimeType) {
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
	record ChatInput(String userMessage, List<AttachmentRef> attachments, List<Turn> history) {
	}

	/** 출처 데이터 (응답 annotations 에 대응) */
	record CitationData(int seq, String sourceName, String snippet) {
	}

	/**
	 * 채팅 결과. noSource=true면 무자료(citations 가 비어 있음, REQ-RAG-003). 응답 텍스트에 접두를 붙이지 않는다 - 표시는 플래그로 한다.
	 *
	 * <p>{@code inputTokens}·{@code outputTokens} 는 이 턴이 실제로 쓴 토큰 수임(FEAT-OPS-001).
	 * <b>모르면 null</b> - 목업 · usage 필드가 없는 응답 · 중단으로 완료 이벤트 전에 끝난 턴이 그렇다.
	 * 0 으로 채우면 합계에서 "정말 0"과 구분되지 않아 턴당 평균이 거짓이 됨.
	 */
	record ChatCompletion(String fullText, List<CitationData> citations, boolean noSource,
			Integer inputTokens, Integer outputTokens) {
	}

	/**
	 * 진행 단계 키(REQ-CHAT-005). 키는 Mock/Real 공통이고 <b>라벨 문자열은 구현이 소유함</b>(P-2 : ChatService는 모드를 알지 않음).
	 * ANALYZING은 ChatService가 meta 직후 발행하고, SEARCHING·REVIEWING·GENERATING은 구현이 자기 경계에서 올림.
	 * REVIEWING은 검색 결과가 <b>실제로 도착한</b> 뒤에만 오며 결과가 0건이면 오지 않음(#375).
	 */
	enum Stage {
		ANALYZING, SEARCHING, REVIEWING, GENERATING
	}

	/**
	 * 단계 라벨. 목업은 목 데이터임이 드러나는 전용 문구를 씀(REQ-RAG-004).
	 *
	 * @param sources   그 단계가 <b>실제로 참조한</b> 자료명. 참조한 자료가 없거나 그 시점에 아직 알 수 없으면
	 *                  빈 리스트임 - 비어 있으면 자료명을 붙이지 않음(없는 자료명을 지어내지 않기 위함, REQ-RAG-004)
	 * @param withImage 이번 턴에 첨부 이미지가 있는가. 분석 단계 문구만 이것을 봄(#375) - 이미지를 보는 시점을 알리는
	 *                  이벤트가 없어 따로 단계를 두지 않고 문구로만 밝힘
	 */
	String stageLabel(Stage stage, List<String> sources, boolean withImage);

	/** 확인 단계 라벨의 자료 부분 - 「첫 자료명 외 N건」, 하나뿐이면 이름만. 목업·라이브가 같은 꼴을 쓰게 한 곳에 둠 */
	static String sourceSummary(List<String> sources) {
		return sources.size() == 1 ? sources.get(0) : sources.get(0) + " 외 " + (sources.size() - 1) + "건";
	}

	/**
	 * 스트리밍 채팅. 토큰을 onToken으로 흘리고(ChatService 가 SSE 로 내보냄) 완료 시 결과 반환.
	 * onStage는 실제로 통과한 경계에서만 호출함 - 근거가 없으면 그 단계를 보내지 않음(REQ-RAG-004).
	 * 두 번째 인자는 그 단계가 참조한 자료명이며 근거가 없으면 빈 리스트임.
	 * OpenAI 실 호출은 여기 뒤에만 존재함(키 비노출).
	 */
	ChatCompletion streamChat(ChatInput input, Consumer<String> onToken, BiConsumer<Stage, List<String>> onStage);

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
	UploadedDocument uploadDocument(String filename, byte[] content);

	/**
	 * 인덱싱 상태 조회 - {@code in_progress} | {@code completed} | {@code failed} 중 하나를 돌려줌.
	 *
	 * <p><b>모르면 null</b>(#91). 조회 자체가 실패한 것(순단 · 429 · 502)은 <b>「인덱싱 실패」와 다르다.</b>
	 * 둘을 같은 값으로 뭉개면 호출자가 「모름」을 확정된 실패로 영속화하고, 그 행은 재조회 대상에서
	 * 빠져 <b>다시는 묻지 않는다</b> - 색인이 정상 완료돼 답변에 인용되는 문서가 화면에는 영구히
	 * 「실패」로 남는다. 토큰 사용량이 모르면 null 인 것과 같은 규약이다(FEAT-OPS-001).
	 */
	String documentStatus(String vectorStoreId, String openaiFileId);

	/**
	 * Vector Store 연결 해제 + 파일 삭제. 실패해도 예외를 던지지 않음(호출자는 삭제를 계속 진행함).
	 *
	 * <p><b>연결 해제가 실패하면 파일은 남긴다</b>(#271). 파일까지 지우면 스토어에 이름 없는 연결이 남아 검색에는
	 * 잡히는데 다시 지울 손잡이가 없다. 파일이 남아 있으면 스토어 동기화(#193)가 행을 되살려(soft delete 된 행은
	 * 살아 있는 행으로 치지 않음) 관리자가 다시 지울 수 있다.
	 */
	void deleteDocument(String vectorStoreId, String openaiFileId);

	/**
	 * 공용 스토어의 파일 하나(#193). {@code status} 는 {@link #documentStatus} 와 같은 어휘로 좁힌 값이다.
	 * 스토어 ID 를 함께 싣는 것은 {@link UploadedDocument} 와 같은 이유다 - 호출자는 어느 스토어인지 모른다.
	 *
	 * <p>{@link #MISSING} 은 이 어휘 밖의 값이다 - 스토어 연결은 있는데 파일이 지워져 없는 상태(#271).
	 */
	record StoreFile(String openaiFileId, String vectorStoreId, String filename, long byteSize, String status) {
		public static final String MISSING = "missing";
	}

	/**
	 * 공용 Vector Store 에 들어 있는 파일 전부 - 스토어 동기화용(#193).
	 *
	 * <p>{@code needsDetail} 이 참인 파일만 파일명·크기를 따로 조회한다(스토어 파일 응답에는 파일명이 없다).
	 * 나머지는 {@code filename} 이 null 이고 {@code byteSize} 가 0 이다 - 이미 행이 있는 파일까지 매번
	 * 조회하지 않기 위함이다.
	 *
	 * <p><b>하나라도 실패하면 던진다.</b> 일부만 돌려주면 호출자가 그것을 전부로 읽어 빠진 문서가 없다고 보고한다.
	 * 단 파일이 없다는 확답(404)은 실패가 아니라 그 파일의 상태다 - {@link StoreFile#MISSING} 으로 돌려준다(#271).
	 */
	List<StoreFile> listStoreFiles(Predicate<String> needsDetail);
}
