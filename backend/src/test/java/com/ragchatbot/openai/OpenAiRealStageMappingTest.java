package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.openai.OpenAiService.Stage;

/**
 * Phase 7 : 라이브 스트림 → 진행 단계 매핑을 실 호출 없이 고정함(AC-24 · 리스크 R-13).
 * 캔드 SSE를 파서에 직접 먹임 - OpenAI 호출·Docker 불필요.
 *
 * <p>주의(S-1) : 이 테스트는 <b>매핑 로직</b>만 검증함. 실 API가 어떤 순서로 이벤트를 보내는지는
 * 실 키로 확인해야 하며 이관-6(M2 스파이크)에 남아 있음.
 */
class OpenAiRealStageMappingTest {

	// 타임아웃 3종은 이 테스트들의 관심사가 아니다 - 기본값과 같은 비율만 지킨다(#92)
	private static final long STREAM_READ_MS = 540_000;
	private static final long REQUEST_MS = 30_000;
	private static final long SSE_MS = 600_000;

	/** 공용 Store가 없어 file_search 도구를 안 붙인 응답 - 검색 이벤트가 아예 오지 않음 */
	private static final String SSE_WITHOUT_SEARCH = """
			data:{"type":"response.created"}
			data:{"type":"response.output_text.delta","delta":"일반적인 "}
			data:{"type":"response.output_text.delta","delta":"관점임"}
			data:{"type":"response.completed","response":{"output":[]}}
			data:[DONE]
			""";

	/** file_search가 실제로 돈 응답 - 검색 이벤트 + 인용 annotation 포함 */
	private static final String SSE_WITH_SEARCH = """
			data:{"type":"response.created"}
			data:{"type":"response.file_search_call.in_progress"}
			data:{"type":"response.file_search_call.searching"}
			data:{"type":"response.file_search_call.completed"}
			data:{"type":"response.output_text.delta","delta":"안내는 다음과 같음 [1]"}
			data:{"type":"response.completed","response":{"output":[\
			{"type":"file_search_call","results":[{"filename":"정책.pdf","text":"발췌 본문"}]},\
			{"type":"message","content":[{"annotations":[{"type":"file_citation","filename":"정책.pdf"}]}]}]}}
			data:[DONE]
			""";

	private OpenAiRealService service() {
		// api-key는 blank가 아니어야 빈이 생성됨(fail-fast 가드). 이 테스트는 네트워크를 타지 않음
		return new OpenAiRealService("test-key", "gpt-4o", "", "http://localhost:1", STREAM_READ_MS, REQUEST_MS, SSE_MS, null);
	}

	private List<Stage> stagesOf(String sse, List<String> tokensOut, ChatCompletion[] resultOut) {
		List<Stage> stages = new ArrayList<>();
		resultOut[0] = service().consumeStream(
				new ByteArrayInputStream(sse.getBytes(StandardCharsets.UTF_8)),
				tokensOut::add, (stage, sources) -> stages.add(stage));
		return stages;
	}

	@Test
	void no_search_events_means_no_search_stage() {
		List<String> tokens = new ArrayList<>();
		ChatCompletion[] result = new ChatCompletion[1];

		List<Stage> stages = stagesOf(SSE_WITHOUT_SEARCH, tokens, result);

		// AC-24 : file_search 이벤트가 없으면 검색 단계는 0건임(연출 금지)
		assertThat(stages).containsExactly(Stage.GENERATING);
		assertThat(result[0].noSource()).isTrue();
		assertThat(result[0].citations()).isEmpty();
		assertThat(String.join("", tokens)).isEqualTo("일반적인 관점임");
	}

	@Test
	void search_events_map_to_searching_before_generating() {
		List<String> tokens = new ArrayList<>();
		ChatCompletion[] result = new ChatCompletion[1];

		List<Stage> stages = stagesOf(SSE_WITH_SEARCH, tokens, result);

		// in_progress·searching이 연달아 와도 검색 단계는 한 번만, 생성 단계보다 앞에 옴
		assertThat(stages).containsExactly(Stage.SEARCHING, Stage.GENERATING);
		assertThat(result[0].noSource()).isFalse();
		assertThat(result[0].citations()).singleElement()
				.satisfies(c -> assertThat(c.sourceName()).isEqualTo("정책.pdf"));
	}

	@Test
	void live_labels_are_not_mock_labels() {
		OpenAiRealService live = service();
		assertThat(live.stageLabel(Stage.ANALYZING, List.of())).isEqualTo("질문 분석 중");
		assertThat(live.stageLabel(Stage.SEARCHING, List.of())).isEqualTo("참조 문서 검색 중");
		assertThat(live.stageLabel(Stage.GENERATING, List.of())).isEqualTo("답변 작성 중");
	}

	/**
	 * 라이브는 검색 시작 시점에 어느 문서가 걸렸는지 모르므로 자료명을 라벨에 싣지 않음(P-10).
	 * 자료명이 들어오더라도 라벨을 바꾸지 않는다는 것을 고정함 - 나중에 실 연동에서 이 결정을 되돌린다면
	 * 이 테스트가 먼저 깨져 "언제 알 수 있는가"를 다시 확인하게 됨
	 */
	@Test
	void live_search_label_ignores_source_names() {
		assertThat(service().stageLabel(Stage.SEARCHING, List.of("정책.pdf"))).isEqualTo("참조 문서 검색 중");
	}
}
