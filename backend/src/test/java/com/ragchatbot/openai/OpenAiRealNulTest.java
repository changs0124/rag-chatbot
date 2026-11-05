package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.openai.OpenAiService.CitationData;

/**
 * #610 : 업스트림 텍스트의 NUL(U+0000)이 화면 토큰 · 저장본에 남지 않는지 고정함.
 * PostgreSQL text 는 0x00 을 저장하지 못해, 남으면 다 받은 답의 저장이 실패한다.
 * 페이로드의 {@code \\u0000} 은 JSON 이스케이프라 Jackson 이 실제 NUL 문자로 푼다.
 */
class OpenAiRealNulTest {

	private static final String NUL = "\u0000";

	private record Run(ChatCompletion completion, List<String> tokens, List<List<String>> stageSources) {
	}

	private static Run run(String delta, String results, String annotations) {
		String sse = "data:{\"type\":\"response.output_item.done\",\"item\":{\"type\":\"file_search_call\",\"results\":["
				+ results + "]}}\n"
				+ "data:{\"type\":\"response.output_text.delta\",\"delta\":\"" + delta + "\"}\n"
				+ "data:{\"type\":\"response.completed\",\"response\":{\"output\":["
				+ "{\"type\":\"file_search_call\",\"results\":[" + results + "]},"
				+ "{\"type\":\"message\",\"content\":[{\"annotations\":[" + annotations + "]}]}]}}\n";
		List<String> tokens = new ArrayList<>();
		List<List<String>> stageSources = new ArrayList<>();
		ChatCompletion c = OpenAiRealTestSupport.parserOnly().consumeStream(
				new ByteArrayInputStream(sse.getBytes(StandardCharsets.UTF_8)), tokens::add,
				(stage, sources) -> stageSources.add(sources));
		return new Run(c, tokens, stageSources);
	}

	@Test
	void nul_in_delta_is_dropped_from_tokens_and_full_text() {
		Run r = run("답\\u0000입니다", "{\"filename\":\"매뉴얼.md\",\"text\":\"발췌\"}",
				"{\"type\":\"file_citation\",\"filename\":\"매뉴얼.md\"}");

		assertThat(String.join("", r.tokens())).isEqualTo("답입니다");
		assertThat(r.completion().fullText()).isEqualTo("답입니다");
	}

	@Test
	void nul_in_search_result_text_is_dropped_from_snippet() {
		Run r = run("답", "{\"filename\":\"매뉴얼.md\",\"text\":\"발\\u0000췌\"}",
				"{\"type\":\"file_citation\",\"filename\":\"매뉴얼.md\"}");

		assertThat(r.completion().citations()).extracting(CitationData::snippet).containsExactly("발췌");
	}

	@Test
	void nul_in_filenames_is_dropped_from_source_names_and_stage_labels() {
		Run r = run("답", "{\"filename\":\"매뉴\\u0000얼.md\",\"text\":\"발췌\"}",
				"{\"type\":\"file_citation\",\"filename\":\"매뉴\\u0000얼.md\"}");

		assertThat(r.completion().citations()).extracting(CitationData::sourceName).containsExactly("매뉴얼.md");
		assertThat(r.stageSources()).allSatisfy(sources -> assertThat(sources).noneMatch(s -> s.contains(NUL)));
	}
}
