package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.openai.OpenAiService.Stage;

/**
 * 완료 이벤트의 사용량 파싱 (FEAT-OPS-001 · TC-OPS-001~002).
 *
 * <p>캔드 스트림으로만 검증함 - 실 응답의 필드명 대조는 CI 가 할 수 없고
 * {@code docs/01_specs/live-integration.md} 의 수동 절차가 담당함(가정 목록에 적혀 있음).
 */
class OpenAiRealUsageTest {

	// 타임아웃 3종은 이 테스트들의 관심사가 아니다 - 기본값과 같은 비율만 지킨다(#92)
	private static final long STREAM_READ_MS = 540_000;
	private static final long REQUEST_MS = 30_000;
	private static final long SSE_MS = 600_000;

	private static InputStream sse(String body) {
		return new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8));
	}

	private static OpenAiRealService service() {
		// 생성자는 키만 비지 않으면 뜸. consumeStream 은 네트워크를 타지 않는 순수 파서라 이대로 충분함
		return new OpenAiRealService("test-key", "gpt-4o", "", "https://example.invalid/v1", STREAM_READ_MS, REQUEST_MS, SSE_MS, null);
	}

	private static ChatCompletion consume(String body) {
		return service().consumeStream(sse(body), token -> {
		}, (Stage stage, List<String> sources) -> {
		});
	}

	/** TC-OPS-001 : 완료 응답의 사용량이 결과에 실린다 */
	@Test
	void usage_is_extracted_from_completed_event() {
		String body = """
				data: {"type":"response.output_text.delta","delta":"답변"}

				data: {"type":"response.completed","response":{"output":[],\
				"usage":{"input_tokens":1200,"output_tokens":340}}}

				data: [DONE]

				""";

		ChatCompletion result = consume(body);

		assertThat(result.inputTokens()).isEqualTo(1200);
		assertThat(result.outputTokens()).isEqualTo(340);
	}

	/**
	 * TC-OPS-002 : 사용량이 없으면 null 로 남는다.
	 *
	 * <p>Jackson 의 {@code asInt()} 는 없는 노드에 0 을 주므로, 무심코 쓰면 "usage 가 안 왔다"와
	 * "정말 0 토큰"이 저장에서 구분되지 않음 - 합계가 조용히 낮아짐. 0 이 아니라 null 임을 잠근다.
	 */
	@Test
	void missing_usage_stays_null_not_zero() {
		String body = """
				data: {"type":"response.output_text.delta","delta":"답변"}

				data: {"type":"response.completed","response":{"output":[]}}

				data: [DONE]

				""";

		ChatCompletion result = consume(body);

		assertThat(result.inputTokens()).isNull();
		assertThat(result.outputTokens()).isNull();
	}

	/** usage 가 숫자가 아닌 형태로 와도 0 으로 뭉개지 않음 */
	@Test
	void non_numeric_usage_stays_null() {
		String body = """
				data: {"type":"response.completed","response":{"output":[],\
				"usage":{"input_tokens":null,"output_tokens":"많음"}}}

				data: [DONE]

				""";

		ChatCompletion result = consume(body);

		assertThat(result.inputTokens()).isNull();
		assertThat(result.outputTokens()).isNull();
	}
}
