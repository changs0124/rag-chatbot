package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.ragchatbot.openai.OpenAiService.ChatCompletion;

/**
 * #277 : sol 계열이 본문에 섞는 인용 표기 원문({@code U+E200 … U+E201})을 걷어 내는지 고정함.
 * 표기 모양은 2026-10-15 gpt-6-sol 실측 답에서 가져옴.
 */
class CitationMarkupFilterTest {

	private static final String MARK = "fileciteturn0file12turn0file9";

	private static String run(String... deltas) {
		CitationMarkupFilter f = new CitationMarkupFilter();
		StringBuilder out = new StringBuilder();
		for (String d : deltas) {
			out.append(f.accept(d));
		}
		return out.toString();
	}

	@Test
	void marker_inside_one_token_is_removed() {
		assertThat(run("확인됩니다. " + MARK + "\n다음 단계")).isEqualTo("확인됩니다. \n다음 단계");
	}

	@Test
	void marker_split_across_tokens_is_removed() {
		assertThat(run("확인됩니다. ", "file", "citeturn0", "file2", "\n다음")).isEqualTo("확인됩니다. \n다음");
	}

	@Test
	void two_markers_and_text_between_survive() {
		assertThat(run("가" + MARK + "나", MARK + "다")).isEqualTo("가나다");
	}

	@Test
	void plain_text_is_unchanged() {
		String plain = "**MODE** 로 진단 표시모드 [[그림:tm-p039-f2]] `AL.2144` — 끝";
		CitationMarkupFilter f = new CitationMarkupFilter();
		assertThat(f.accept(plain)).isSameAs(plain);
	}

	@Test
	void unclosed_marker_at_end_is_dropped() {
		assertThat(run("끝. fileciteturn0")).isEqualTo("끝. ");
	}

	@Test
	void stray_end_char_outside_marker_is_kept() {
		// 시작 없이 온 끝 글자는 표기라고 볼 근거가 없음 - 건드리지 않음
		assertThat(run("ab")).isEqualTo("ab");
	}

	@Test
	void stream_tokens_and_saved_text_both_exclude_marker() {
		String sse = """
				data:{"type":"response.output_text.delta","delta":"됩니다. \\ue200file"}
				data:{"type":"response.output_text.delta","delta":"cite\\ue202turn0file2\\ue201"}
				data:{"type":"response.output_text.delta","delta":"\\n끝"}
				data:{"type":"response.completed","response":{"output":[]}}
				""";
		List<String> tokens = new ArrayList<>();
		OpenAiRealService service = OpenAiRealTestSupport.parserOnly();

		ChatCompletion result = service.consumeStream(new ByteArrayInputStream(sse.getBytes(StandardCharsets.UTF_8)),
				tokens::add, (stage, sources) -> { });

		// 표기만 든 delta 는 빈 토큰으로도 내보내지 않음
		assertThat(tokens).containsExactly("됩니다. ", "\n끝");
		// 저장 텍스트 = 스트리밍으로 내보낸 것과 같음
		assertThat(result.fullText()).isEqualTo("됩니다. \n끝").isEqualTo(String.join("", tokens));
	}

	// ── #429 : 문서 이름 자리에 온 표기는 문서 이름으로 바꿈 ──────────────────────────

	private static final String REF0 = "fileciteturn0file0";

	private static String runWithSearch(String... deltas) {
		CitationMarkupFilter f = new CitationMarkupFilter();
		f.addSearch(List.of("필드클레임현황.md"));
		StringBuilder out = new StringBuilder();
		for (String d : deltas) {
			out.append(f.accept(d));
		}
		return out.append(f.flush()).toString();
	}

	@Test
	void noun_slot_before_comma_and_particle_gets_document_name() {
		// 2026-10-23 운영 C8 1턴 답 그대로의 모양
		assertThat(runWithSearch("클레임 3의 상세 기록은 " + REF0 + " , 클레임 145의 상세 기록은 " + REF0 + " 에서 확인됩니다."))
				.isEqualTo("클레임 3의 상세 기록은 필드클레임현황, 클레임 145의 상세 기록은 필드클레임현황에서 확인됩니다.");
	}

	@Test
	void noun_slot_without_spaces_gets_name_with_one_space() {
		assertThat(runWithSearch("결과는" + REF0 + "에 기록돼 있습니다.")).isEqualTo("결과는 필드클레임현황에 기록돼 있습니다.");
	}

	@Test
	void noun_slot_split_across_tokens_gets_document_name() {
		CitationMarkupFilter f = new CitationMarkupFilter();
		f.addSearch(List.of("필드클레임현황.md"));
		assertThat(f.accept("기록은 file")).isEqualTo("기록은 ");
		assertThat(f.accept("citeturn0file0")).isEmpty();
		assertThat(f.accept(" ")).isEmpty(); // 첫 글자를 볼 때까지 보류
		assertThat(f.accept("에서 확인됩니다.")).isEqualTo("필드클레임현황에서 확인됩니다.");
	}

	@Test
	void marker_outside_noun_slot_is_only_removed() {
		assertThat(runWithSearch("확인됩니다. " + REF0 + "\n다음 단계")).isEqualTo("확인됩니다. \n다음 단계");
		assertThat(runWithSearch("확인됩니다 " + REF0 + ".")).isEqualTo("확인됩니다 .");
		assertThat(runWithSearch("| R64 | 설계불량 " + REF0 + " |")).isEqualTo("| R64 | 설계불량  |");
		assertThat(runWithSearch("가" + REF0 + "나")).isEqualTo("가나");
		// 명사 끝 · 단어 첫 글자로 흔한 「과 · 도 · 로 · 이」 둘레(리뷰 지적)
		assertThat(runWithSearch("점검 결과 " + REF0 + " 이상 없음")).isEqualTo("점검 결과  이상 없음");
		assertThat(runWithSearch("모터 온도는 80도" + REF0 + ", 전류는")).isEqualTo("모터 온도는 80도, 전류는");
		assertThat(runWithSearch("축 방향으로" + REF0 + ", 다음")).isEqualTo("축 방향으로, 다음");
	}

	@Test
	void two_markers_with_space_between_in_noun_slot_get_one_name() {
		assertThat(runWithSearch("기록은 " + REF0 + " " + REF0 + " 에서")).isEqualTo("기록은 필드클레임현황에서");
	}

	@Test
	void name_keeps_dots_that_are_not_an_extension() {
		CitationMarkupFilter f = new CitationMarkupFilter();
		f.addSearch(List.of("매뉴얼 v1.2"));
		assertThat(f.accept("기록은 " + REF0 + "에서")).isEqualTo("기록은 매뉴얼 v1.2에서");
	}

	@Test
	void unresolved_reference_is_only_removed() {
		// 검색 결과로 풀리지 않는 참조는 이름을 지어내지 않고 지금처럼 지우기만 함
		assertThat(run("기록은 " + REF0 + " 에서 확인됩니다.")).isEqualTo("기록은  에서 확인됩니다.");
	}

	@Test
	void spaces_held_after_last_marker_come_back_on_flush() {
		CitationMarkupFilter f = new CitationMarkupFilter();
		assertThat(f.accept("끝 " + REF0 + "  ")).isEqualTo("끝 ");
		assertThat(f.flush()).isEqualTo("  ");
	}

	@Test
	void stream_puts_name_from_search_results_into_noun_slot() {
		String sse = """
				data:{"type":"response.output_item.done","item":{"type":"file_search_call","results":[{"filename":"TM매뉴얼.md","text":"a"},{"filename":"필드클레임현황.md","text":"b"}]}}
				data:{"type":"response.output_text.delta","delta":"기록은 \\ue200filecite\\ue202turn0file1\\ue201"}
				data:{"type":"response.output_text.delta","delta":" 에서 확인됩니다. \\ue200filecite\\ue202turn0file1\\ue201 "}
				data:{"type":"response.completed","response":{"output":[]}}
				""";
		List<String> tokens = new ArrayList<>();
		OpenAiRealService service = OpenAiRealTestSupport.parserOnly();

		ChatCompletion result = service.consumeStream(new ByteArrayInputStream(sse.getBytes(StandardCharsets.UTF_8)),
				tokens::add, (stage, sources) -> { });

		assertThat(result.fullText()).isEqualTo("기록은 필드클레임현황에서 확인됩니다.  ").isEqualTo(String.join("", tokens));
	}
}
