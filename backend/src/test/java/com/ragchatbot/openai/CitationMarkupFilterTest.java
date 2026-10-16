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
}
