package com.ragchatbot.openai;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

import org.springframework.beans.factory.annotation.Value;
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

	// 무자료는 **텍스트 접두가 아니라 플래그**로 알림(2026-07-28 결정).
	// 라이브는 인용 0건 여부를 스트림이 끝나야 알 수 있어 이미 흘려보낸 토큰 앞에 접두를 붙일 수 없음 -
	// 접두를 유지하면 화면(접두 없음)과 재조회(접두 있음)가 어긋남(Phase 4 리뷰 H4-1).
	// 판정 규칙은 Mock·Real 공통으로 citations.isEmpty() 하나임(P-8).

	/** 목업 고정 코퍼스 키워드 */
	private static final List<String> CORPUS_KEYWORDS = List.of("환불", "배송", "정책", "가격", "이용", "약관");

	/**
	 * 목업 전용 단계 라벨(R-11 · P-10). 라이브 라벨을 그대로 쓰지 않음 - 목업의 "검색"은 사용자 문자열
	 * 키워드 비교라 문서 검색이 아니므로, 화면 문구만 봐도 목 데이터임이 드러나야 함.
	 */
	private static final Map<Stage, String> STAGE_LABELS = Map.of(
			Stage.ANALYZING, "질문 분석 중(목업)",
			Stage.SEARCHING, "목업 코퍼스 조회 중",
			Stage.GENERATING, "답변 작성 중(목업)");

	/** 토큰당 지연(ms) - 실제 스트리밍처럼 타이핑 효과를 보이게 함. 테스트는 0 */
	private final long tokenDelayMs;

	// 기록(테스트 검증용) - 목 응답 자체는 이력과 무관하지만, 이력이 실제로 전달됐는지는 여기서 확인함
	private final AtomicInteger deleteResourcesCalls = new AtomicInteger();
	private volatile int lastAttachmentCount = 0;
	private volatile List<Turn> lastHistory = List.of();

	public OpenAiMockService(@Value("${app.mock.token-delay-ms:45}") long tokenDelayMs) {
		this.tokenDelayMs = tokenDelayMs;
	}

	@Override
	public String stageLabel(Stage stage, List<String> sources) {
		String label = STAGE_LABELS.get(stage);
		// 조회 단계에만 자료명을 덧붙임 - "어느 자료를 참조했는지"가 화면에 드러나야 함(R-11).
		// 무자료 분기에서는 sources가 비어 있어 문구가 종전 그대로임 - 참조한 적 없는 이름을 붙이지 않기 위함(P-10)
		if (stage == Stage.SEARCHING && !sources.isEmpty()) {
			return label + " - " + String.join(" · ", sources);
		}
		return label;
	}

	@Override
	public ChatCompletion streamChat(ChatInput input, Consumer<String> onToken, BiConsumer<Stage, List<String>> onStage) {
		lastAttachmentCount = input.attachments() == null ? 0 : input.attachments().size();
		// 목 응답은 고정 코퍼스 키워드로만 정해짐(이력에 좌우되지 않음). 전달 여부만 기록해 둠
		lastHistory = input.history() == null ? List.of() : input.history();

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
			fullText = imagePrefix + "일반적인 관점에서 이렇게 볼 수 있음.";
			citations = List.of();
			noSource = true;
		}

		// 코퍼스 조회 경계 - 목업이 실제로 지나는 지점에서만 단계를 올림(P-10). 자료 유무와 무관하게 조회는 함.
		// 조회 결과가 정해진 뒤에 올림 - 라벨에 실제로 참조한 자료명을 실어야 하기 때문임(R-11).
		// 자료명은 화면 하단 출처 목록과 같은 값을 씀 - 진행 문구와 출처가 어긋나지 않게 함
		onStage.accept(Stage.SEARCHING, citations.stream().map(CitationData::sourceName).toList());

		// 스트리밍 인터페이스를 실제로 흘려봄(Phase 5 SSE가 이 onToken을 emitter에 연결)
		// 토큰당 소량 지연으로 실제 스트리밍처럼 타이핑 효과를 냄
		// 첫 토큰 직전이 생성 경계임. 체감 시간을 만들려고 여기에 인위 지연을 넣지 않음(P-10 · 이관-7)
		onStage.accept(Stage.GENERATING, List.of());
		for (String chunk : fullText.split("(?<=\\G.{8})")) {
			onToken.accept(chunk);
			if (tokenDelayMs > 0) {
				try {
					Thread.sleep(tokenDelayMs);
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
					break;
				}
			}
		}
		// 목업은 실제 토큰을 쓰지 않으므로 사용량을 null 로 둠 - 숫자를 지어내면 합계가 거짓이 됨(FEAT-OPS-001)
		return new ChatCompletion(fullText, citations, noSource, null, null);
	}

	@Override
	public void deleteResources(String vectorStoreId, List<String> openaiFileIds) {
		deleteResourcesCalls.incrementAndGet();
		// 목업 : 실제 삭제 없이 호출만 기록
	}

	public int deleteResourcesCalls() {
		return deleteResourcesCalls.get();
	}

	public int lastAttachmentCount() {
		return lastAttachmentCount;
	}

	/** 직전 호출에 전달된 이전 턴들(오래된 것부터). 이력이 실제로 붙었는지 검증용 */
	public List<Turn> lastHistory() {
		return lastHistory;
	}
}
