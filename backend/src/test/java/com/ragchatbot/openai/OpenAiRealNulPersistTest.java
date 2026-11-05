package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.service.ChatPersistenceService;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * #614 : #610 의 NUL 제거를 실제 PostgreSQL 저장까지 잠근다. {@code OpenAiRealNulTest} 는 파서 반환값만 본다.
 *
 * <p>NUL(U+0000)이 답 조각 · 검색 결과 본문 · 두 파일명에 모두 든 스트림을 실서비스 파서로 읽고, 그 결과를 채팅 저장과 같은
 * {@code saveAssistant} 로 넣는다. 지우지 않으면 PostgreSQL 이 text 의 0x00 을 거절해 저장이 던진다.
 * 페이로드의 파일명 · 본문은 JSON 이스케이프(백슬래시 u0000)라 Jackson 이 실제 NUL 로 푼다.
 *
 * <p>한계 : HTTP 채팅 경로(ChatService)는 타지 않는다 - 파서 → 저장 서비스 구간만 본다. 가짜 OpenAI 서버를 띄운 채팅 통합 지지대가 아직 없다.
 * {@code status} 는 이 테스트가 넘기는 값이라 단언은 저장 성공 확인 용도다.
 */
class OpenAiRealNulPersistTest extends AbstractPgIntegrationTest {

	@Autowired
	private ChatPersistenceService chatPersistence;

	@Test
	void stream_with_nul_everywhere_is_saved_without_nul() {
		String results = "{\"filename\":\"매뉴\\u0000얼.md\",\"text\":\"발\\u0000췌\"}";
		String sse = "data:{\"type\":\"response.output_item.done\",\"item\":{\"type\":\"file_search_call\",\"results\":["
				+ results + "]}}\n"
				+ "data:{\"type\":\"response.output_text.delta\",\"delta\":\"답\\u0000입니다\"}\n"
				+ "data:{\"type\":\"response.completed\",\"response\":{\"output\":["
				+ "{\"type\":\"file_search_call\",\"results\":[" + results + "]},"
				+ "{\"type\":\"message\",\"content\":[{\"annotations\":["
				+ "{\"type\":\"file_citation\",\"filename\":\"매뉴\\u0000얼.md\"}]}]}]}}\n";
		ChatCompletion c = OpenAiRealTestSupport.parserOnly().consumeStream(
				new ByteArrayInputStream(sse.getBytes(StandardCharsets.UTF_8)), t -> { }, (stage, sources) -> { });

		String token = createUser("nul-persist@b.com");
		UUID conversationId = UUID.fromString(createConversation(token));
		UUID assistantId = UUID.randomUUID();
		chatPersistence.saveAssistant(conversationId, userId("nul-persist@b.com"), assistantId, c.fullText(), "complete",
				false, false, c.citations(), null, null);

		Map<String, Object> message = jdbc.queryForMap("select content, status from messages where id = ?", assistantId);
		assertThat(message).containsEntry("content", "답입니다").containsEntry("status", "complete");
		Map<String, Object> citation = jdbc.queryForMap(
				"select source_name, snippet from citations where message_id = ?", assistantId);
		assertThat(citation).containsEntry("source_name", "매뉴얼.md").containsEntry("snippet", "발췌");
	}
}
