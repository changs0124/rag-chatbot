package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.openai.OpenAiService.CitationData;

/**
 * #268 : 출처 스니펫이 검색 1순위가 아니라 답이 근거로 쓴 청크를 가리키는지 고정함.
 * 실측 사례(2026-10-15) : 「서보 모터 각 부 명칭 그림」 답이 쓴 청크는 7위, 1위는 SET 키 조작 단락이었다.
 */
class SnippetPickTest {

	private static final String UNRELATED = "UP 키를 1번 눌러서 오른쪽 표시창 값을 2로 설정하고 SET 키를 누릅니다.";
	private static final String OTHER = "외부 오버라이드 신호에 의한 자체 조그 기능을 함께 씁니다.";
	private static final String NAMES = "1.1 명칭 : 엔코더 커넥터, 파워 커넥터, 명판, 출력축, 플랜지, 프레임.";

	@Test
	void chunk_overlapping_the_answer_wins_over_top_rank() {
		String answer = "서보 모터 각 부 명칭은 엔코더 커넥터 · 파워 커넥터 · 명판 · 출력축 · 플랜지입니다.";

		assertThat(OpenAiRealService.pickSnippet(List.of(UNRELATED, OTHER, NAMES), answer)).isEqualTo(NAMES);
	}

	@Test
	void no_overlap_falls_back_to_top_rank() {
		assertThat(OpenAiRealService.pickSnippet(List.of(UNRELATED, OTHER), "zz qq")).isEqualTo(UNRELATED);
	}

	@Test
	void chunk_with_the_answers_figure_mark_wins() {
		String figureChunk = "[[그림:tm-p020-f1]] (그림 설명: 서보 모터 외형)";
		String answer = "명칭 그림입니다.\n[[그림:tm-p020-f1]]\n" + NAMES; // 겹침만 보면 NAMES 가 이김

		assertThat(OpenAiRealService.pickSnippet(List.of(UNRELATED, NAMES, figureChunk), answer)).isEqualTo(figureChunk);
	}

	@Test
	void snippet_starts_at_the_figure_mark_inside_the_chunk() {
		// 실측(FIG 2회차) : 표식을 담은 청크를 골라도 앞 200자는 옆 쪽의 「위치 보정값」 단락이었다
		String chunk = UNRELATED + "\n" + OTHER + "\n[[그림:tm-p120-f1]] (그림 설명: 모터 명칭)";

		assertThat(OpenAiRealService.pickSnippet(List.of(chunk), "그림입니다. [[그림:tm-p120-f1]]"))
				.isEqualTo("[[그림:tm-p120-f1]] (그림 설명: 모터 명칭)");
	}

	@Test
	void snippet_starts_at_the_line_overlapping_the_answer() {
		// 실측(B4 · F3) : 알람 표 청크를 골라도 앞부분은 다른 알람 행이었다
		String battery = "엔코더 배터리 이상 : 배터리 전압이 3.2V 이하일 때 발생 - 배터리를 교체한다.";
		String chunk = "파라미터 이상 : 저장값이 범위 밖일 때 발생\n과전류 : 모터로 과전류가 흐를 때 발생\n" + battery;

		assertThat(OpenAiRealService.pickSnippet(List.of(chunk), "배터리 전압이 3.2V 이하이면 배터리를 교체하세요."))
				.isEqualTo(battery);
	}

	@Test
	void stream_uses_the_picked_chunk_as_snippet() {
		String sse = """
				data:{"type":"response.output_text.delta","delta":"엔코더 커넥터와 파워 커넥터, 플랜지가 있습니다."}
				data:{"type":"response.completed","response":{"output":[\
				{"type":"file_search_call","results":[\
				{"filename":"매뉴얼.md","text":"%s"},{"filename":"매뉴얼.md","text":"%s"}]},\
				{"type":"message","content":[{"annotations":[{"type":"file_citation","filename":"매뉴얼.md"}]}]}]}}
				""".formatted(UNRELATED, NAMES);
		OpenAiRealService service = new OpenAiRealService("test-key", "gpt-4o", "", "http://localhost:1",
				540_000, 30_000, 600_000, null);

		ChatCompletion r = service.consumeStream(new ByteArrayInputStream(sse.getBytes(StandardCharsets.UTF_8)),
				t -> { }, (stage, sources) -> { });

		assertThat(r.citations()).extracting(CitationData::snippet).containsExactly(NAMES);
	}
}
