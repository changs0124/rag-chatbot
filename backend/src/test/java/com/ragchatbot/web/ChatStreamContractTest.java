package com.ragchatbot.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * Phase 7 : SSE 이벤트 계약을 고정함(리스크 R-14).
 * stage 이벤트를 추가해도 meta → stage* → token* → citations → done 순서가 깨지지 않아야 하고,
 * 기존 수신부가 의존하는 이벤트가 사라지지 않아야 함.
 */
class ChatStreamContractTest extends AbstractPgIntegrationTest {

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private String createConversation(String token) {
		var res = rest.exchange("/api/conversations", HttpMethod.POST,
				new HttpEntity<>(Map.of("title", "계약"), bearer(token)), Map.class);
		return (String) res.getBody().get("id");
	}

	private static List<String> eventNames(String sse) {
		List<String> names = new ArrayList<>();
		for (String line : sse.split("\n")) {
			if (line.startsWith("event:")) {
				names.add(line.substring(6).trim());
			}
		}
		return names;
	}

	@Test
	void sse_event_order_holds_with_stage_added() {
		String token = signup("contract@b.com");
		var res = rest.exchange("/api/chat", HttpMethod.POST,
				new HttpEntity<>(Map.of("conversationId", createConversation(token), "message", "이용 약관 안내"),
						bearer(token)),
				String.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);

		List<String> names = eventNames(res.getBody());
		assertThat(names).isNotEmpty();
		assertThat(names.get(0)).isEqualTo("meta");
		assertThat(names).contains("stage", "token", "citations", "done");
		assertThat(names.get(names.size() - 1)).isEqualTo("done");

		// 순서 계약 : 모든 stage < 첫 token < citations < done
		assertThat(names.lastIndexOf("stage")).isLessThan(names.indexOf("token"));
		assertThat(names.lastIndexOf("token")).isLessThan(names.indexOf("citations"));
		assertThat(names.indexOf("citations")).isLessThan(names.indexOf("done"));
	}
}
