package com.ragchatbot.controller;

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
		assertThat(body).contains("\"noSource\":true");
		assertThat(stageKeys(body)).containsExactly("analyzing", "searching", "generating");
	}

	@Test
	void mock_uses_mock_only_labels() {
		String body = chat(signup("stage-label@b.com"), "가격 문의");
		assertThat(body).contains("질문 분석 중(목업)").contains("목업 코퍼스 조회 중").contains("답변 작성 중(목업)");
		assertThat(body).doesNotContain(LIVE_SEARCH_LABEL); // AC-24 : 라이브 라벨 재사용 금지
	}

	/**
	 * R-11 : "어느 자료를 참조했는지"가 진행 문구에 드러나야 함. 자료명은 화면 하단 출처 목록과 <b>같은 값</b>을
	 * 씀 - 진행 문구가 말한 자료와 실제로 붙는 출처가 어긋나면 그 자체가 거짓 표시가 됨
	 */
	@Test
	void mock_search_label_names_the_sources_it_used() {
		String body = chat(signup("stage-sources@b.com"), "환불 규정");
		assertThat(body).contains("목업 코퍼스 조회 중 - 이용 정책 문서 · FAQ 문서");
	}

	/** 무자료 분기에는 붙일 자료명이 없음 - 참조한 적 없는 이름을 지어내지 않음(P-10) */
	@Test
	void mock_search_label_has_no_source_names_when_nothing_matched() {
		String body = chat(signup("stage-nosources@b.com"), "우주의 크기는 얼마나 되나");
		assertThat(body).contains("목업 코퍼스 조회 중");
		assertThat(body).doesNotContain("이용 정책 문서");
	}

	@Test
	void no_stage_event_after_first_token() {
		List<String> names = eventNames(chat(signup("stage-after@b.com"), "배송 정책"));
		int firstToken = names.indexOf("token");
		assertThat(firstToken).as("token 이벤트가 있어야 함").isGreaterThanOrEqualTo(0);
		assertThat(names.subList(firstToken, names.size())).doesNotContain("stage");
	}
}
