package com.ragchatbot.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import com.ragchatbot.openai.OpenAiMockService;
import com.ragchatbot.support.AbstractPgIntegrationTest;

import tools.jackson.databind.ObjectMapper;

/** 저장할 수 없는 문자를 조용히 바꾸거나 모델에 보내면 입력과 이력이 달라지므로 HTTP 경계에서 거절해야 한다. */
class UserTextValidationFlowTest extends AbstractPgIntegrationTest {

	@MockitoSpyBean
	private OpenAiMockService openAi;

	private String token;
	private String conversationId;

	@BeforeEach
	void setUp() {
		token = createAdminUser("text-" + UUID.randomUUID() + "@b.com");
		conversationId = createConversation(token);
	}

	private List<List<Map<String, Object>>> rows() {
		return List.of(
				jdbc.queryForList("select * from users order by id"),
				jdbc.queryForList("select * from conversations order by id"),
				jdbc.queryForList("select * from messages order by id"),
				jdbc.queryForList("select * from attachments order by id"));
	}

	private void reject(HttpMethod method, String path, String json, String reason) {
		var before = rows();
		var headers = bearer(token);
		headers.setContentType(MediaType.APPLICATION_JSON);
		if (path.equals("/api/chat")) {
			headers.setAccept(List.of(MediaType.TEXT_EVENT_STREAM));
		}
		var res = rest.exchange(path, method, new HttpEntity<>(json, headers), String.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
		assertThat(res.getHeaders().getContentType().isCompatibleWith(MediaType.APPLICATION_JSON)).isTrue();
		var error = new ObjectMapper().readTree(res.getBody());
		assertThat(error.get("code").asString()).isEqualTo("BAD_REQUEST");
		assertThat(error.get("message").asString()).contains(reason);
		assertThat(rows()).isEqualTo(before);
		verifyNoInteractions(openAi);
	}

	// HTTP 인코더가 외톨이 서로게이트를 대체하지 않도록 원래 JSON 이스케이프를 직접 보낸다.
	private String chatJson(String escaped) {
		return "{\"conversationId\":\"" + conversationId + "\",\"message\":\"" + escaped + "\"}";
	}

	@ParameterizedTest
	@ValueSource(strings = { "가\\u0000나", "\\u0000가나", "가나\\u0000", "\\u0000" })
	void chat_nul_is_rejected_before_storage_and_model(String escaped) {
		reject(HttpMethod.POST, "/api/chat", chatJson(escaped), "NUL");
	}

	@ParameterizedTest
	@ValueSource(strings = { "가\\u0000나", "\\u0000가나", "가나\\u0000", "\\u0000" })
	void create_title_nul_is_rejected_without_changes(String escaped) {
		reject(HttpMethod.POST, "/api/conversations", "{\"title\":\"" + escaped + "\"}", "NUL");
	}

	@ParameterizedTest
	@ValueSource(strings = { "가\\u0000나", "\\u0000가나", "가나\\u0000", "\\u0000" })
	void rename_title_nul_is_rejected_without_changes(String escaped) {
		reject(HttpMethod.PATCH, "/api/conversations/" + conversationId, "{\"title\":\"" + escaped + "\"}", "NUL");
	}

	@ParameterizedTest
	@ValueSource(strings = { "가\\u0000나", "\\u0000가나", "가나\\u0000", "\\u0000" })
	void profile_name_nul_is_rejected_without_changes(String escaped) {
		reject(HttpMethod.PATCH, "/api/profile/name", "{\"name\":\"" + escaped + "\"}", "NUL");
	}

	@ParameterizedTest
	@ValueSource(strings = { "가\\u0000나", "\\u0000가나", "가나\\u0000", "\\u0000" })
	void issued_name_nul_is_rejected_without_changes(String escaped) {
		reject(HttpMethod.POST, "/api/admin/users",
				"{\"email\":\"issued-" + UUID.randomUUID() + "@b.com\",\"name\":\"" + escaped + "\"}", "NUL");
	}

	@ParameterizedTest
	@ValueSource(strings = { "가\\ud800나", "가\\udc00나", "\\ud800", "\\udc00", "\\udc00\\ud800", "\\ud800\\ud800" })
	void lone_surrogate_chat_is_rejected_before_storage_and_model(String escaped) {
		reject(HttpMethod.POST, "/api/chat", chatJson(escaped), "서로게이트");
	}

	static Stream<Arguments> validMessages() {
		return Stream.of(Arguments.of("안녕하세요", "안녕하세요"), Arguments.of("한글\\ud83d\\ude00입니다", "한글😀입니다"));
	}

	@ParameterizedTest
	@MethodSource("validMessages")
	void korean_and_valid_surrogate_pair_reach_model_and_storage(String escaped, String expected) {
		var headers = bearer(token);
		headers.setContentType(MediaType.APPLICATION_JSON);
		headers.setAccept(List.of(MediaType.TEXT_EVENT_STREAM));

		var res = rest.exchange("/api/chat", HttpMethod.POST,
				new HttpEntity<>(chatJson(escaped), headers), String.class);

		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(res.getBody()).contains("event:done").doesNotContain("event:error");
		assertThat(jdbc.queryForObject("select content from messages where conversation_id = ?::uuid and role = 'user'",
				String.class, conversationId)).isEqualTo(expected);
		assertThat(jdbc.queryForObject("select count(*) from messages where conversation_id = ?::uuid",
				Integer.class, conversationId)).isEqualTo(2);
		verify(openAi).streamChat(argThat(input -> input.userMessage().equals(expected)), any(), any());
	}
}
