package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;

import com.ragchatbot.openai.OpenAiMockService;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * Phase 5 : SSE 스트리밍 채팅 + 레이트리밋.
 * AC-6(무자료) · AC-7(출처 저장·재조회) · AC-10(429) · AC-12 · AC-14 · AC-21.
 */
class ChatFlowTest extends AbstractPgIntegrationTest {

	@Autowired
	private OpenAiMockService mock;

	private static final byte[] PNG = { (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0 };

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private String createConversation(String token) {
		var res = rest.exchange("/api/conversations", HttpMethod.POST,
				new HttpEntity<>(Map.of("title", "채팅"), bearer(token)), Map.class);
		return (String) res.getBody().get("id");
	}

	@SuppressWarnings({ "rawtypes", "unchecked" })
	private String uploadImage(String token) {
		var partHeaders = new HttpHeaders();
		partHeaders.setContentType(MediaType.IMAGE_PNG);
		var resource = new ByteArrayResource(PNG) {
			@Override
			public String getFilename() {
				return "a.png";
			}
		};
		var body = new LinkedMultiValueMap<String, Object>();
		body.add("file", new HttpEntity<>(resource, partHeaders));
		var headers = bearer(token);
		headers.setContentType(MediaType.MULTIPART_FORM_DATA);
		var res = rest.postForEntity("/api/files", new HttpEntity<>(body, headers), Map.class);
		String url = (String) res.getBody().get("url");
		return url.substring(url.indexOf("/api/files/") + 11, url.indexOf('?'));
	}

	/** SSE 스트림을 문자열로 수신(목업은 빠르게 완료됨) */
	private ResponseEntity<String> chat(String token, Map<String, Object> body) {
		return rest.exchange("/api/chat", HttpMethod.POST, new HttpEntity<>(body, bearer(token)), String.class);
	}

	@Test
	@SuppressWarnings("unchecked")
	void known_topic_streams_citations_and_persists() {
		String token = createUser("chat-known@b.com");
		String convId = createConversation(token);

		var res = chat(token, Map.of("conversationId", convId, "message", "환불 정책 알려줘"));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody()).contains("event:token").contains("event:citations")
				.contains("event:done").contains("이용 정책 문서");

		// AC-7 : 재조회 시 출처 유지
		var messages = rest.exchange("/api/conversations/" + convId + "/messages", HttpMethod.GET,
				new HttpEntity<>(bearer(token)), List.class);
		List<Map<String, Object>> list = messages.getBody();
		var assistant = list.stream().filter(m -> "assistant".equals(m.get("role"))).findFirst().orElseThrow();
		assertThat((List<?>) assistant.get("citations")).isNotEmpty();
		assertThat((String) assistant.get("content")).isNotBlank();
		// stopped·timedOut 이 DB → resultMap → record → JSON 을 실제로 건너오는지(#84).
		// 값이 아니라 **키의 존재**를 본다 - 이 경로에는 다른 그물이 하나도 없다.
		// check-response-contract.sh 는 DocumentResponse 한 쌍만 보고, types.ts 에서 둘 다
		// 옵셔널이라 tsc 도 못 잡는다. 키가 끊기면 undefined→falsy 가 되어 재조회한 중단 답변에
		// 「자료 없음」 배너가 거짓으로 붙는다 - overview.md 「데이터 흐름」이 지키라고 적어 둔 불변식이다
		assertThat(assistant).containsKeys("stopped", "timedOut");
	}

	@Test
	@SuppressWarnings("unchecked")
	void citations_stay_attached_to_their_own_message() {
		// 재조회는 대화 전체의 출처를 한 번에 읽어 메시지별로 나눠 담음 - 나누는 규칙이 어긋나면
		// 출처가 남의 답변에 붙거나 사라짐. 답변이 하나뿐인 테스트로는 그 어긋남이 드러나지 않음
		String token = createUser("chat-cite-group@b.com");
		String convId = createConversation(token);

		chat(token, Map.of("conversationId", convId, "message", "환불 정책 알려줘")); // 출처 2건
		chat(token, Map.of("conversationId", convId, "message", "우주의 크기는 얼마나 되나")); // 출처 0건

		var messages = rest.exchange("/api/conversations/" + convId + "/messages", HttpMethod.GET,
				new HttpEntity<>(bearer(token)), List.class);
		List<Map<String, Object>> list = messages.getBody();
		// 순서가 아니라 본문으로 짚음 - 같은 순간에 저장돼 정렬이 뒤집혀도 판정이 흔들리지 않게
		var withSource = pickAssistant(list, "안내는 다음과 같음");
		var withoutSource = pickAssistant(list, "일반적인 관점에서");

		assertThat((List<?>) withSource.get("citations")).hasSize(2);
		assertThat((List<?>) withoutSource.get("citations")).isEmpty();
	}

	private static Map<String, Object> pickAssistant(List<Map<String, Object>> messages, String contentPart) {
		return messages.stream()
				.filter(m -> "assistant".equals(m.get("role")))
				.filter(m -> ((String) m.get("content")).contains(contentPart))
				.findFirst()
				.orElseThrow(() -> new AssertionError("답변을 찾지 못함: " + contentPart));
	}

	/**
	 * 같은 대화의 이전 턴이 모델에 전달돼야 함 - 전달되지 않으면 매 턴 문맥이 초기화돼
	 * "앞에서 말한 그거"를 알아듣지 못함. 목 응답 자체는 이력과 무관하므로 전달 여부로 판정함.
	 */
	@Test
	void previous_turns_are_sent_to_the_model() {
		String token = createUser("chat-history@b.com");
		String convId = createConversation(token);

		chat(token, Map.of("conversationId", convId, "message", "첫 질문"));
		chat(token, Map.of("conversationId", convId, "message", "둘째 질문"));

		// 둘째 턴이 본 이력 = 첫 질문 + 첫 답변 (이번 질문은 이력에 들어가지 않음)
		var history = mock.lastHistory();
		assertThat(history).hasSize(2);
		assertThat(history.get(0).role()).isEqualTo("user");
		assertThat(history.get(0).content()).isEqualTo("첫 질문");
		assertThat(history.get(1).role()).isEqualTo("assistant");
		assertThat(history.get(1).content()).isNotBlank();
	}

	/** 첫 턴에는 이력이 없어야 함 - 방금 보낸 메시지가 이력에 섞이면 같은 말이 두 번 전달됨 */
	@Test
	void first_turn_has_no_history() {
		String token = createUser("chat-history-first@b.com");
		String convId = createConversation(token);

		chat(token, Map.of("conversationId", convId, "message", "첫 질문"));

		assertThat(mock.lastHistory()).isEmpty();
	}

	/** 과거 이미지는 재전송하지 않고 자리표시자만 남김 - 턴이 쌓일수록 비용이 폭증하는 것을 막음 */
	@Test
	void past_images_are_not_resent() {
		String token = createUser("chat-history-img@b.com");
		String convId = createConversation(token);
		String attId = uploadImage(token);

		chat(token, Map.of("conversationId", convId, "message", "이거 뭐야", "attachmentIds", List.of(attId)));
		chat(token, Map.of("conversationId", convId, "message", "그럼 저건?"));

		assertThat(mock.lastAttachmentCount()).isZero(); // 이번 턴에는 첨부가 없음
		assertThat(mock.lastHistory().get(0).content()).contains("(이미지 첨부)");
	}

	@Test
	void unknown_topic_streams_no_source() {
		String token = createUser("chat-unknown@b.com");
		String convId = createConversation(token);
		var res = chat(token, Map.of("conversationId", convId, "message", "우주의 크기는 얼마나 되나"));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		// 무자료는 텍스트 접두가 아니라 done 이벤트의 noSource 플래그로 판정함(2026-07-28)
		assertThat(res.getBody()).contains("\"noSource\":true").doesNotContain("이용 정책 문서");
		assertThat(res.getBody()).doesNotContain("자료 없음"); // 접두가 텍스트에 섞이지 않음
	}

	@Test
	void image_only_message_allowed_and_passed() {
		String token = createUser("chat-img@b.com");
		String convId = createConversation(token);
		String attId = uploadImage(token);

		var res = chat(token, Map.of("conversationId", convId, "message", "", "attachmentIds", List.of(attId)));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK); // AC-21
		assertThat(mock.lastAttachmentCount()).isEqualTo(1); // AC-14
	}

	@Test
	void attachments_survive_reload_with_fresh_url() {
		// 재조회 응답에 첨부가 없어 새로고침하면 이미지가 사라졌음(Phase 3 리뷰 M3-6)
		String token = createUser("chat-reload@b.com");
		String convId = createConversation(token);
		String attId = uploadImage(token);
		chat(token, Map.of("conversationId", convId, "message", "이 이미지", "attachmentIds", List.of(attId)));

		var res = rest.exchange("/api/conversations/" + convId + "/messages", HttpMethod.GET,
				new HttpEntity<>(bearer(token)), List.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);

		@SuppressWarnings("unchecked")
		List<Map<String, Object>> messages = res.getBody();
		var withAttachment = messages.stream()
				.filter(m -> !((List<?>) m.get("attachments")).isEmpty())
				.findFirst()
				.orElseThrow(() -> new AssertionError("첨부가 실린 메시지가 없음"));

		@SuppressWarnings("unchecked")
		var atts = (List<Map<String, Object>>) withAttachment.get("attachments");
		assertThat(atts).hasSize(1);
		assertThat(atts.get(0).get("id")).isEqualTo(attId);
		assertThat(atts.get(0).get("fileType")).isEqualTo("image");
		// 서명 토큰이 붙어 있는지까지만 잼. "조회 시점 재서명"은 첨부 테이블에 URL 컬럼 자체가 없어
		// 구조적으로 그럴 수밖에 없는 것이라 여기서 따로 재지 않음(재리뷰 지적 9)
		assertThat(String.valueOf(atts.get(0).get("url"))).contains("/api/files/" + attId + "?token=");
	}

	@Test
	void delete_conversation_calls_openai_cleanup() {
		String token = createUser("chat-del@b.com");
		String convId = createConversation(token);
		chat(token, Map.of("conversationId", convId, "message", "가격 문의"));

		int before = mock.deleteResourcesCalls();
		var del = rest.exchange("/api/conversations/" + convId, HttpMethod.DELETE,
				new HttpEntity<>(bearer(token)), Void.class);
		assertThat(del.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
		assertThat(mock.deleteResourcesCalls()).isGreaterThan(before); // AC-12
	}

	@Test
	void empty_message_no_attachment_400() {
		String token = createUser("chat-empty@b.com");
		String convId = createConversation(token);
		var res = chat(token, Map.of("conversationId", convId, "message", ""));
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}

	/**
	 * 상한 5/분(테스트 프로퍼티).
	 *
	 * <p><b>고정 윈도우라 요청이 분 경계를 걸치면 카운터가 중간에 리셋됨.</b> 종전에는 6회만 보냈는데,
	 * 5회가 이전 분에 1회가 새 분에 떨어지면 어느 창도 상한을 넘지 못해 429가 한 번도 안 났음
	 * (2026-07-29 CI 07:05:00 경계에서 실제로 실패). 시각에 따라 갈리는 검사는 게이트가 되지 못함.
	 *
	 * <p>그래서 <b>상한의 두 배 + 1</b>회를 보냄 - 경계를 한 번 넘어 최악으로 갈려도(5/6) 한쪽 창에는
	 * 반드시 상한 초과분이 쌓임. 요청이 1초 안에 끝나므로 경계를 두 번 넘을 일은 없음.
	 */
	@Test
	void rate_limit_returns_429_when_exceeded() {
		String token = createUser("chat-rl@b.com");
		String convId = createConversation(token);
		int perMinute = 5;
		int attempts = perMinute * 2 + 1;

		boolean saw429 = false;
		for (int i = 0; i < attempts; i++) {
			var res = chat(token, Map.of("conversationId", convId, "message", "가격 문의 " + i));
			if (res.getStatusCode() == HttpStatus.TOO_MANY_REQUESTS) {
				saw429 = true;
			}
		}
		assertThat(saw429).as("%d회 중 최소 1회는 429여야 함", attempts).isTrue();
	}
}
