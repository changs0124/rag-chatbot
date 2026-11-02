package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.openai.OpenAiService.CitationData;
import com.ragchatbot.openai.OpenAiService.Stage;

/**
 * {@code response.incomplete} 로 끝난 턴은 잘렸지만 끝난 턴이다 (#553).
 *
 * <p>출력 상한({@code max_output_tokens}) · {@code content_filter} 로 끝나는 턴은 {@code response.completed} 대신
 * {@code response.incomplete} 가 같은 {@code response} 객체를 싣고 온다. 이 이벤트를 읽지 않던 동안 사용자는 답을 끝까지
 * 받고도 오류 배너를 봤고, 저장은 {@code status=error} 라 인용 · 사용량이 사라졌다.
 */
@ExtendWith(OutputCaptureExtension.class)
class OpenAiRealStreamIncompleteTest {

	private static ChatCompletion consume(String body, List<String> tokens) {
		return OpenAiRealTestSupport.parserOnly()
				.consumeStream(new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)), tokens::add,
						(Stage stage, List<String> sources) -> {
						});
	}

	private static String incomplete(String reason) {
		return """
				data: {"type":"response.created","response":{"status":"in_progress"},"sequence_number":0}

				data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":1,"content_index":0,\
				"delta":"안내는 ","sequence_number":5}

				data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":1,"content_index":0,\
				"delta":"다음과 같음","sequence_number":6}

				data: {"type":"response.incomplete","response":{"id":"resp_1","status":"incomplete",\
				"incomplete_details":{"reason":"%s"},"output":[\
				{"type":"file_search_call","results":[{"filename":"정책.pdf","text":"발췌 본문"}]},\
				{"type":"message","status":"incomplete","content":[{"type":"output_text","text":"안내는 다음과 같음",\
				"annotations":[{"type":"file_citation","filename":"정책.pdf"}]}]}],\
				"usage":{"input_tokens":1200,"output_tokens":64}},"sequence_number":7}

				""".formatted(reason);
	}

	/** 출력 상한으로 잘린 턴 - 받은 본문 · 인용 · 사용량이 그대로 결과에 실리고 사유가 WARN 한 줄로 남는다 */
	@Test
	void max_output_tokens_is_saved_as_truncated_completion(CapturedOutput output) {
		List<String> tokens = new ArrayList<>();

		ChatCompletion result = consume(incomplete("max_output_tokens"), tokens);

		assertThat(result.fullText()).isEqualTo("안내는 다음과 같음");
		assertThat(String.join("", tokens)).isEqualTo(result.fullText());
		assertThat(result.citations()).extracting(CitationData::sourceName).containsExactly("정책.pdf");
		assertThat(result.noSource()).isFalse();
		assertThat(result.inputTokens()).isEqualTo(1200);
		assertThat(result.outputTokens()).isEqualTo(64);
		assertThat(output.getOut()).containsOnlyOnce("openai response incomplete reason=max_output_tokens");
	}

	/** 콘텐츠 필터로 잘린 턴도 같은 길 - 사유만 다르다 */
	@Test
	void content_filter_is_saved_as_truncated_completion(CapturedOutput output) {
		ChatCompletion result = consume(incomplete("content_filter"), new ArrayList<>());

		assertThat(result.fullText()).isEqualTo("안내는 다음과 같음");
		assertThat(result.citations()).extracting(CitationData::sourceName).containsExactly("정책.pdf");
		assertThat(result.outputTokens()).isEqualTo(64);
		assertThat(output.getOut()).containsOnlyOnce("openai response incomplete reason=content_filter");
	}
}
