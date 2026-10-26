package com.ragchatbot.controller;

import static com.ragchatbot.support.SseTestSupport.stubStageLabel;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.openai.OpenAiService.Stage;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 200(meta) 뒤 · 첫 토큰 전에 끊긴 턴의 질문은 서버가 걷는다(#489).
 *
 * <p>#487 탐침과 같은 방식 - 실 톰캣에 원시 소켓으로 {@code POST /api/chat} 을 열고, 원하는 지점까지 읽은 뒤 RST 로 끊는다.
 * 서버는 끊김을 다음 전송이 실패할 때 안다. 모델 대역은 소켓이 닫힌 것을 확인한 뒤에야 다음 이벤트를 보내므로
 * 「끊긴 뒤의 전송 실패」가 늘 같은 자리에서 난다.
 */
@TestPropertySource(properties = "app.ratelimit.chat-per-minute=1000")
class ChatEarlyDisconnectTest extends AbstractPgIntegrationTest {

	@MockitoBean
	OpenAiService openAi;

	private final CountDownLatch clientClosed = new CountDownLatch(1);

	@BeforeEach
	void stageLabel() {
		stubStageLabel(openAi);
	}

	/**
	 * 모델 대역 : {@code tokensBeforeClose} 개를 보낸 뒤 클라이언트가 끊기를 기다리고, 끊긴 뒤에는 전송이 실패할 때까지
	 * 단계(토큰 전) 또는 토큰(토큰 뒤)을 계속 보낸다. 끝내 실패하지 않으면 완주해 테스트가 틀리게 끝난다
	 */
	@SuppressWarnings("unchecked")
	private void stubModel(int tokensBeforeClose) {
		when(openAi.streamChat(any(), any(), any())).thenAnswer(inv -> {
			Consumer<String> onToken = inv.getArgument(1);
			BiConsumer<Stage, List<String>> onStage = inv.getArgument(2);
			for (int i = 0; i < tokensBeforeClose; i++) {
				onToken.accept("t" + i + "|");
			}
			assertThat(clientClosed.await(10, TimeUnit.SECONDS)).isTrue();
			for (int i = 0; i < 50; i++) {
				if (tokensBeforeClose == 0) {
					onStage.accept(Stage.SEARCHING, List.of());
				} else {
					onToken.accept("x|");
				}
				Thread.sleep(100);
			}
			return new ChatCompletion("끝까지 만든 답", List.of(), true, null, null);
		});
	}

	/** 원시 소켓으로 채팅을 열고 {@code until} 이 본문에 {@code count} 번 보일 때까지 읽은 뒤 RST 로 끊는다 */
	private String openAndCut(String token, String body, String until, int count) throws Exception {
		int port = URI.create(rest.getRootUri()).getPort();
		byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
		String head = "POST /api/chat HTTP/1.1\r\nHost: localhost:" + port + "\r\nAuthorization: Bearer " + token
				+ "\r\nContent-Type: application/json\r\nAccept: text/event-stream\r\nContent-Length: "
				+ bodyBytes.length + "\r\n\r\n";
		StringBuilder got = new StringBuilder();
		try (Socket s = new Socket("127.0.0.1", port)) {
			s.setSoTimeout(15000);
			OutputStream os = s.getOutputStream();
			os.write(head.getBytes(StandardCharsets.ISO_8859_1));
			os.write(bodyBytes);
			os.flush();
			InputStream is = s.getInputStream();
			byte[] buf = new byte[4096];
			while (count(got, until) < count) {
				int n = is.read(buf);
				if (n < 0) {
					break;
				}
				got.append(new String(buf, 0, n, StandardCharsets.UTF_8));
			}
			s.setSoLinger(true, 0);
		}
		clientClosed.countDown();
		return got.toString();
	}

	private static int count(CharSequence s, String needle) {
		int c = 0;
		for (int i = s.toString().indexOf(needle); i >= 0; i = s.toString().indexOf(needle, i + 1)) {
			c++;
		}
		return c;
	}

	/**
	 * 끊김을 알아챈 서버가 저장 · 철회를 커밋하기를 기다린다. 조건이 끝내 안 서면 그대로 돌아가 단언이 실패한다.
	 * 모델 대역이 끝나기를 기다리지 않는다 - meta 직후의 단계(analyzing) 전송이 이미 실패하면 모델은 불리지도 않는다(#487 탐침 (b) RST)
	 */
	private void awaitSettled(BooleanSupplier settled) throws Exception {
		long deadline = System.currentTimeMillis() + 15000;
		while (!settled.getAsBoolean() && System.currentTimeMillis() < deadline) {
			Thread.sleep(50);
		}
	}

	private int count(String sql, Object... args) {
		return jdbc.queryForObject(sql, Integer.class, args);
	}

	/**
	 * TC-CHAT-001 : meta 를 받자마자 끊으면 질문 행을 지우고 첨부 연결을 푼다(#489). 첨부 행 · 대화는 남고, 대화의
	 * updated_at 도 그대로다(질문 저장은 touch 하지 않는다)
	 */
	@Test
	@SuppressWarnings("rawtypes")
	void cut_right_after_meta_retracts_question_and_unlinks_attachment() throws Exception {
		stubModel(0);
		String token = createUser("early-cut-meta@b.com");
		String convId = createConversation(token);
		UUID conv = UUID.fromString(convId);
		Timestamp touchedBefore = jdbc.queryForObject("select updated_at from conversations where id = ?",
				Timestamp.class, conv);
		Map up = rest.postForEntity("/api/files", multipart(token, "a.png", PNG_MAGIC, MediaType.IMAGE_PNG), Map.class)
				.getBody();
		UUID attId = UUID.fromString((String) up.get("id"));

		String got = openAndCut(token, "{\"conversationId\":\"" + convId + "\",\"message\":\"질문\",\"attachmentIds\":[\""
				+ attId + "\"]}", "event:meta", 1);
		assertThat(got).startsWith("HTTP/1.1 200").doesNotContain("event:token");

		awaitSettled(() -> count("select count(*) from messages where conversation_id = ?", conv) == 0);

		assertThat(count("select count(*) from messages where conversation_id = ?", conv)).isZero();
		// 첨부 파일 행은 남고 연결만 풀린다 - 입력창 카드로 다시 쓴다
		assertThat(count("select count(*) from attachments where id = ? and message_id is null", attId)).isOne();
		// 빈 대화는 지우지 않는다 - 프론트가 조건부 삭제로 정리한다(#440 · #447)
		assertThat(jdbc.queryForObject("select updated_at from conversations where id = ?", Timestamp.class, conv))
				.isEqualTo(touchedBefore);
	}

	/** TC-CHAT-002 : 토큰을 3개 받은 뒤 끊으면 지금처럼 질문 + stopped 부분 답이 남는다(#489 에서 바뀌지 않음) */
	@Test
	void cut_after_three_tokens_keeps_question_and_stopped_answer() throws Exception {
		stubModel(3);
		String token = createUser("early-cut-tokens@b.com");
		String convId = createConversation(token);
		UUID conv = UUID.fromString(convId);

		String got = openAndCut(token, "{\"conversationId\":\"" + convId + "\",\"message\":\"질문\"}", "event:token", 3);
		assertThat(count(got, "event:token")).isEqualTo(3);

		awaitSettled(() -> count("select count(*) from messages where conversation_id = ? and role = 'assistant'",
				conv) == 1);

		assertThat(count("select count(*) from messages where conversation_id = ? and role = 'user'", conv)).isOne();
		var answer = jdbc.queryForMap(
				"select status, stopped, timed_out, content from messages where conversation_id = ? and role = 'assistant'",
				conv);
		assertThat(answer.get("status")).isEqualTo("complete");
		assertThat(answer.get("stopped")).isEqualTo(true);
		assertThat(answer.get("timed_out")).isEqualTo(false);
		assertThat((String) answer.get("content")).startsWith("t0|t1|t2|");
	}
}
