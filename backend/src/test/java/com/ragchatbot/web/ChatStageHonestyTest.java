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
 * Phase 7 : 진행 단계 표시(R-11)가 실제 동작과 어긋나지 않는지 고정함(리스크 R-13 · AC-24).
 * 목업 단계는 목업이 실제로 지나는 경계에서만 나오고, 라벨도 라이브 문구가 아닌 목업 전용 문구여야 함(P-10).
 */
class ChatStageHonestyTest extends AbstractPgIntegrationTest {

	/** 라이브 전용 라벨 - 목업 응답에 이 문구가 섞이면 시연 관람자가 실 검색으로 오인함 */
	private static final String LIVE_SEARCH_LABEL = "참조 문서 검색 중";

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private String createConversation(String token) {
		var res = rest.exchange("/api/conversations", HttpMethod.POST,
				new HttpEntity<>(Map.of("title", "단계"), bearer(token)), Map.class);
		return (String) res.getBody().get("id");
	}

	private String chat(String token, String message) {
		var res = rest.exchange("/api/chat", HttpMethod.POST,
				new HttpEntity<>(Map.of("conversationId", createConversation(token), "message", message), bearer(token)),
				String.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		return res.getBody();
	}

	/** SSE 본문에서 이벤트 이름을 등장 순서대로 뽑음 */
	private static List<String> eventNames(String sse) {
		List<String> names = new ArrayList<>();
		for (String line : sse.split("\n")) {
			if (line.startsWith("event:")) {
				names.add(line.substring(6).trim());
			}
		}
		return names;
	}

	/** `data:{"stage":"searching",...}` 에서 stage 키를 등장 순서대로 뽑음 */
	private static List<String> stageKeys(String sse) {
		List<String> keys = new ArrayList<>();
		for (String line : sse.split("\n")) {
			int at = line.indexOf("\"stage\":\"");
			if (line.startsWith("data:") && at >= 0) {
				int from = at + 9;
				keys.add(line.substring(from, line.indexOf('"', from)));
			}
		}
		return keys;
	}

	@Test
	void mock_emits_exact_stage_list_in_order_for_known_topic() {
		String body = chat(signup("stage-known@b.com"), "환불 정책 알려줘");
		// 정확 목록 비교 - 부분집합이 아니라 3종이 순서까지 일치해야 함(기준 낮춤 금지)
		assertThat(stageKeys(body)).containsExactly("analyzing", "searching", "generating");
	}

	@Test
	void mock_emits_same_stage_list_when_no_source() {
		// 무자료 분기도 동일한 3종 - 목업·라이브가 분기에 따라 어긋나지 않게 함(P-8)
		String body = chat(signup("stage-nosource@b.com"), "우주의 크기는 얼마나 되나");
		assertThat(body).contains("자료 없음");
		assertThat(stageKeys(body)).containsExactly("analyzing", "searching", "generating");
	}

	@Test
	void mock_uses_mock_only_labels() {
		String body = chat(signup("stage-label@b.com"), "가격 문의");
		assertThat(body).contains("질문 분석 중(목업)").contains("목업 코퍼스 조회 중").contains("답변 작성 중(목업)");
		assertThat(body).doesNotContain(LIVE_SEARCH_LABEL); // AC-24 : 라이브 라벨 재사용 금지
	}

	@Test
	void no_stage_event_after_first_token() {
		List<String> names = eventNames(chat(signup("stage-after@b.com"), "배송 정책"));
		int firstToken = names.indexOf("token");
		assertThat(firstToken).as("token 이벤트가 있어야 함").isGreaterThanOrEqualTo(0);
		assertThat(names.subList(firstToken, names.size())).doesNotContain("stage");
	}
}
