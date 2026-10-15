package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.openai.OpenAiService.CitationData;

/**
 * #281 : annotation 0건이어도 본문 인용 표기({@code turnNfileM})로 출처를 복원하는지 고정함.
 * 대응 규칙(N번째 file_search_call 의 results[M], 0-base)은 2026-10-15 gpt-6-sol 실측.
 */
class CitationFromMarkupTest {

	/** 검색 두 번. turn0 = [매뉴얼, 클레임], turn1 = [클레임, 매뉴얼] */
	private static final String SEARCHES = """
			{"type":"file_search_call","results":[{"filename":"매뉴얼.md","text":"매뉴얼 발췌"},{"filename":"클레임.md","text":"클레임 발췌"}]},\
			{"type":"file_search_call","results":[{"filename":"클레임.md","text":"클레임 발췌2"},{"filename":"매뉴얼.md","text":"매뉴얼 발췌2"}]}""";

	private static ChatCompletion run(String deltaJson, String messageAnnotations) {
		String sse = "data:{\"type\":\"response.output_text.delta\",\"delta\":\"" + deltaJson + "\"}\n"
				+ "data:{\"type\":\"response.completed\",\"response\":{\"output\":[" + SEARCHES
				+ ",{\"type\":\"message\",\"content\":[{\"annotations\":[" + messageAnnotations + "]}]}]}}\n";
		OpenAiRealService service = new OpenAiRealService("test-key", "gpt-4o", "", "http://localhost:1",
				540_000, 30_000, 600_000, null);
		return service.consumeStream(new ByteArrayInputStream(sse.getBytes(StandardCharsets.UTF_8)), t -> { },
				(stage, sources) -> { });
	}

	@Test
	void markup_restores_citations_when_annotations_are_missing() {
		ChatCompletion r = run("답. \\ue200filecite\\ue202turn1file0\\ue202turn0file0\\ue201", "");

		assertThat(r.noSource()).isFalse();
		// 표기에 나온 순서 · 파일 단위 중복 제거 · 스니펫은 그 파일의 첫 검색 결과
		assertThat(r.citations()).extracting(CitationData::sourceName).containsExactly("클레임.md", "매뉴얼.md");
		assertThat(r.citations()).extracting(CitationData::snippet).containsExactly("클레임 발췌", "매뉴얼 발췌");
		assertThat(r.fullText()).isEqualTo("답. ");
	}

	@Test
	void no_markup_and_no_annotations_stays_no_source() {
		ChatCompletion r = run("자료에서 찾지 못했습니다.", "");

		assertThat(r.noSource()).isTrue();
		assertThat(r.citations()).isEmpty();
	}

	@Test
	void out_of_range_refs_are_ignored() {
		ChatCompletion r = run("답\\ue200filecite\\ue202turn2file0\\ue202turn0file9\\ue201", "");

		assertThat(r.noSource()).isTrue();
	}

	@Test
	void annotations_win_over_markup() {
		ChatCompletion r = run("답\\ue200filecite\\ue202turn0file1\\ue201",
				"{\"type\":\"file_citation\",\"filename\":\"매뉴얼.md\"}");

		assertThat(r.citations()).extracting(CitationData::sourceName).containsExactly("매뉴얼.md");
	}

	@Test
	void non_file_markup_is_not_a_source() {
		CitationMarkupFilter f = new CitationMarkupFilter();
		f.accept("anavlistturn0file0bfileciteturn0file1bogus");

		assertThat(f.fileRefs()).containsExactly(new CitationMarkupFilter.FileRef(0, 1));
	}

	@Test
	void refs_split_across_deltas_are_collected() {
		CitationMarkupFilter f = new CitationMarkupFilter();
		f.accept("xfile");
		f.accept("citeturn3fi");
		f.accept("le12y");

		assertThat(f.fileRefs()).containsExactly(new CitationMarkupFilter.FileRef(3, 12));
	}
}
