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
 * 라이브 스트림 → 진행 단계 매핑을 실 호출 없이 고정함(REQ-CHAT-005).
 * 캔드 SSE를 파서에 직접 먹임 - OpenAI 호출·Docker 불필요.
 *
 * <p>주의(REQ-RAG-005) : 이 테스트는 <b>매핑 로직</b>만 검증함. 실 API 가 이 순서로 이벤트를 보낸다는 것은
 * 2026-09-22 실 키로 확인됨(stage analyzing → searching → generating, live-integration.md 3절 가정 A · #184).
 */
class OpenAiRealStageMappingTest {

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

	/**
	 * 검색 결과가 도착한 응답(#375). {@code include: file_search_call.results} 를 요청하므로 검색이 끝난
	 * {@code response.output_item.done} 에 결과가 실림 - 같은 파일의 청크가 여럿이면 이름이 겹쳐 옴
	 */
	private static final String SSE_WITH_RESULTS = """
			data:{"type":"response.created"}
			data:{"type":"response.file_search_call.in_progress"}
			data:{"type":"response.file_search_call.searching"}
			data:{"type":"response.file_search_call.completed"}
			data:{"type":"response.output_item.done","item":{"type":"file_search_call","results":[			{"filename":"정책.pdf","text":"발췌 1"},{"filename":"정책.pdf","text":"발췌 2"},{"filename":"FAQ.pdf","text":"발췌 3"}]}}
			data:{"type":"response.output_text.delta","delta":"안내는 다음과 같음 [1]"}
			data:{"type":"response.output_item.done","item":{"type":"message","content":[]}}
			data:{"type":"response.completed","response":{"output":[			{"type":"file_search_call","results":[{"filename":"정책.pdf","text":"발췌 1"}]},			{"type":"message","content":[{"annotations":[{"type":"file_citation","filename":"정책.pdf"}]}]}]}}
			data:[DONE]
			""";

	/** 검색은 돌았지만 걸린 문서가 0건인 응답 - 확인할 문서가 없으므로 확인 단계도 없어야 함 */
	private static final String SSE_WITH_EMPTY_RESULTS = """
			data:{"type":"response.created"}
			data:{"type":"response.file_search_call.in_progress"}
			data:{"type":"response.output_item.done","item":{"type":"file_search_call","results":[]}}
			data:{"type":"response.output_text.delta","delta":"일반적인 관점임"}
			data:{"type":"response.completed","response":{"output":[{"type":"file_search_call","results":[]}]}}
			data:[DONE]
			""";

	private OpenAiRealService service() {
		// api-key는 blank가 아니어야 빈이 생성됨(fail-fast 가드). 이 테스트는 네트워크를 타지 않음
		return OpenAiRealTestSupport.parserOnly();
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

		// file_search 이벤트가 없으면 검색 단계는 0건임(연출 금지)
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

	/**
	 * #482 : 마지막 delta 가 파일 이름(확장자 앞)으로 끝나면 리라이터가 「.md」 가 올지 몰라 꼬리를 붙잡고,
	 * 그 꼬리는 response.completed 의 flush 로만 나감 - 내보낸 토큰 합 == 저장 본문 == 짧은 이름이어야 함
	 */
	@Test
	void file_name_held_at_the_last_delta_comes_out_at_the_completed_flush() {
		String sse = """
				data:{"type":"response.output_item.done","item":{"type":"file_search_call","results":[{"filename":"TM매뉴얼_VSVDTMNOPK10_v3.md","text":"발췌"}]}}
				data:{"type":"response.output_text.delta","delta":"근거는 TM매뉴얼_VSVDTMNOPK10_v3"}
				data:{"type":"response.completed","response":{"output":[{"type":"file_search_call","results":[{"filename":"TM매뉴얼_VSVDTMNOPK10_v3.md","text":"발췌"}]}]}}
				""";
		List<String> tokens = new ArrayList<>();
		ChatCompletion[] result = new ChatCompletion[1];

		stagesOf(sse, tokens, result);

		assertThat(tokens).containsExactly("근거는 ", "TM매뉴얼");
		assertThat(result[0].fullText()).isEqualTo("근거는 TM매뉴얼").isEqualTo(String.join("", tokens));
	}

	/** 단계와 그 단계가 실은 자료명을 함께 기록 */
	private List<String> stagesWithSources(String sse) {
		List<String> seen = new ArrayList<>();
		service().consumeStream(new ByteArrayInputStream(sse.getBytes(StandardCharsets.UTF_8)), t -> {
		}, (stage, sources) -> seen.add(stage + sources.toString()));
		return seen;
	}

	@Test
	void arrived_search_results_add_reviewing_stage_with_deduped_names() {
		// 결과가 실제로 도착한 경계에서만 확인 단계를 올림(#375). 이름은 출처와 같은 규칙(filename)으로, 겹치면 한 번만
		assertThat(stagesWithSources(SSE_WITH_RESULTS))
				.containsExactly("SEARCHING[]", "REVIEWING[정책.pdf, FAQ.pdf]", "GENERATING[]");
	}

	@Test
	void empty_search_results_skip_reviewing_stage() {
		// 검색 0건이면 확인할 문서가 없음 - 이름 없는 확인 단계를 만들지 않음(REQ-RAG-004)
		assertThat(stagesWithSources(SSE_WITH_EMPTY_RESULTS)).containsExactly("SEARCHING[]", "GENERATING[]");
	}

	@Test
	void live_labels_are_not_mock_labels() {
		OpenAiRealService live = service();
		assertThat(live.stageLabel(Stage.ANALYZING, List.of(), false)).isEqualTo("질문 분석 중");
		assertThat(live.stageLabel(Stage.SEARCHING, List.of(), false)).isEqualTo("참조 문서 검색 중");
		assertThat(live.stageLabel(Stage.GENERATING, List.of(), false)).isEqualTo("답변 작성 중");
	}

	/** 첨부 이미지가 있는 턴은 분석 단계 문구만 바뀜(#375). 다른 단계는 첨부와 무관함 */
	@Test
	void live_analyzing_label_mentions_attached_image() {
		OpenAiRealService live = service();
		assertThat(live.stageLabel(Stage.ANALYZING, List.of(), true)).isEqualTo("질문·첨부 이미지 분석 중");
		assertThat(live.stageLabel(Stage.GENERATING, List.of(), true)).isEqualTo("답변 작성 중");
	}

	/** 「외 N건」 은 첫 자료 말고 남은 수. 하나뿐이면 붙이지 않음 */
	@Test
	void live_reviewing_label_names_first_source_and_count_of_rest() {
		OpenAiRealService live = service();
		assertThat(live.stageLabel(Stage.REVIEWING, List.of("정책.pdf"), false)).isEqualTo("참조 문서 확인 중 · 정책.pdf");
		assertThat(live.stageLabel(Stage.REVIEWING, List.of("정책.pdf", "FAQ.pdf", "약관.pdf"), false))
				.isEqualTo("참조 문서 확인 중 · 정책.pdf 외 2건");
	}

	/**
	 * 라이브는 검색 시작 시점에 어느 문서가 걸렸는지 모르므로 자료명을 라벨에 싣지 않음(REQ-RAG-004).
	 * 자료명이 들어오더라도 라벨을 바꾸지 않는다는 것을 고정함 - 나중에 실 연동에서 이 결정을 되돌린다면
	 * 이 테스트가 먼저 깨져 "언제 알 수 있는가"를 다시 확인하게 됨
	 */
	@Test
	void live_search_label_ignores_source_names() {
		assertThat(service().stageLabel(Stage.SEARCHING, List.of("정책.pdf"), false)).isEqualTo("참조 문서 검색 중");
	}
}
