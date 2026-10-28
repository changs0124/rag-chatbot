package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.ragchatbot.openai.OpenAiService.Stage;

/**
 * 완료 없이 끝난 스트림의 원인이 예외 메시지에 실리는지 (#536).
 *
 * <p>크레딧 소진은 HTTP 200 으로 열린 스트림에 {@code error} → {@code response.failed} 로 온다(10-28 운영에서 직접 확인).
 * 이 사유를 읽지 않던 동안 로그에는 「완료 없이 종료됨」만 남아 크레딧 소진 · 서버 오류가 갈리지 않았다.
 */
class OpenAiRealStreamFailureTest {

	private static void consume(String body) {
		OpenAiRealTestSupport.against("https://example.invalid/v1", "")
				.consumeStream(new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)), token -> {
				}, (Stage stage, List<String> sources) -> {
				});
	}

	/** 운영에서 받은 모양 그대로 - error 의 사유가 실린다 */
	@Test
	void credit_exhaustion_reason_is_in_the_message() {
		String body = """
				data: {"type":"response.created","response":{"status":"in_progress"}}

				data: {"type":"error","error":{"type":"insufficient_quota","code":"credit_balance_exhausted",\
				"message":"You have no credits remaining.","param":null},"sequence_number":2}

				data: {"type":"response.failed","response":{"status":"failed","error":{"type":"insufficient_quota",\
				"code":"credit_balance_exhausted","message":"You have no credits remaining."}}}

				""";

		assertThatThrownBy(() -> consume(body))
				.isInstanceOf(IllegalStateException.class)
				.hasMessage("OpenAI 응답이 실패로 끝남 code=credit_balance_exhausted type=insufficient_quota "
						+ "message=You have no credits remaining.");
	}

	/** error 이벤트 없이 response.failed 만 와도 사유를 읽는다. 줄바꿈은 로그 한 줄을 깨지 않게 공백으로 */
	@Test
	void failed_event_alone_carries_the_reason() {
		String body = """
				data: {"type":"response.failed","response":{"status":"failed","error":{"type":"server_error",\
				"code":"server_error","message":"line1\\nline2"}}}

				""";

		assertThatThrownBy(() -> consume(body))
				.hasMessage("OpenAI 응답이 실패로 끝남 code=server_error type=server_error message=line1 line2");
	}

	/** 사유를 이벤트 맨 위에 두는 모양(문서상 모양)도 읽는다. 이 모양엔 오류 종류 칸이 없어 type 은 이벤트 이름이 된다 */
	@Test
	void error_event_with_top_level_fields_carries_the_reason() {
		String body = """
				data: {"type":"error","code":"rate_limit_exceeded","message":"Slow down.","param":null}

				""";

		assertThatThrownBy(() -> consume(body))
				.hasMessage("OpenAI 응답이 실패로 끝남 code=rate_limit_exceeded type=error message=Slow down.");
	}

	/** 사유 칸이 빈 실패 이벤트는 빈 칸을 싣지 않고 예전 문구로 */
	@Test
	void failure_without_any_reason_keeps_old_message() {
		String body = """
				data: {"type":"response.failed","response":{"status":"failed"}}

				""";

		assertThatThrownBy(() -> consume(body))
				.hasMessage("OpenAI 스트림이 완료(response.completed) 없이 종료됨");
	}

	/** 사유 없이 끊긴 스트림은 예전 문구 그대로 */
	@Test
	void stream_cut_without_reason_keeps_old_message() {
		String body = """
				data: {"type":"response.output_text.delta","delta":"부분"}

				""";

		assertThatThrownBy(() -> consume(body))
				.hasMessage("OpenAI 스트림이 완료(response.completed) 없이 종료됨");
	}
}
