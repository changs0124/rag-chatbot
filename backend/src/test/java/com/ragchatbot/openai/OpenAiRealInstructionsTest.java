package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

import com.ragchatbot.openai.OpenAiService.ChatInput;

/**
 * 검색 지시를 요청에 싣는지 검증함(#39).
 *
 * <p>{@code tool_choice} 를 주지 않으면 기본값이 {@code auto} 라 file_search 호출 여부가 모델 재량이다.
 * 모델이 검색을 건너뛰면 annotation 이 0건이 되고 화면에는 「자료 없음」이 뜬다 — 스토어에 분명히 있는
 * 내용을 물어도 그렇게 될 수 있다. 지시로 유도하되 강제하지 않는 쪽을 골랐으므로,
 * <b>지시가 실제로 실려 나가는지</b>가 이 선택이 성립하는 최소 조건이다.
 *
 * <p>모델이 그 지시를 따르는지는 여기서 잴 수 없다. 실 연동에서 부착률로 확인할 몫이다.
 * 여기서 잠그는 것은 <b>보내는 쪽</b>이다.
 */
class OpenAiRealInstructionsTest {

	private HttpServer server;
	private final List<String> bodies = new CopyOnWriteArrayList<>();
	private String baseUrl;

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", exchange -> {
			bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
			// 스트림을 파싱하기 전에 끊는다 - 이 테스트가 보는 것은 보낸 쪽이다
			exchange.sendResponseHeaders(500, -1);
			exchange.close();
		});
		server.start();
		baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
	}

	private void chat(String storeId) {
		var service = new OpenAiRealService("test-key", "gpt-4o", storeId, baseUrl, null);
		try {
			service.streamChat(new ChatInput("연차는 언제 소멸하나요?", List.of(), null, List.of()),
					token -> {
					}, (stage, sources) -> {
					});
		} catch (RuntimeException expected) {
			// 스텁이 500 을 돌려주므로 예외가 난다. 검증 대상은 그 전에 보낸 바디다
		}
	}

	/** 스토어가 붙은 턴에는 지시가 실린다 */
	@Test
	void sends_rag_instructions_when_vector_store_is_attached() {
		chat("shared-store");

		assertThat(bodies).hasSize(1);
		assertThat(bodies.get(0))
				.withFailMessage("검색 도구는 붙었는데 instructions 가 없음 - 검색 호출이 모델 재량으로 남는다 (보낸 바디: %s)",
						bodies.get(0))
				.contains("\"instructions\"")
				.contains("file_search");
	}

	/**
	 * 스토어가 없으면 지시를 싣지 않는다.
	 *
	 * <p>검색 도구가 없는데 "사내 문서를 먼저 찾아본다" 고 지시하면 <b>모델에게 없는 도구를 쓰라고
	 * 하는 셈</b>이라 답변이 어긋난다. 지시와 도구는 같이 붙거나 같이 빠져야 한다.
	 */
	@Test
	void omits_instructions_when_no_vector_store() {
		chat("");

		assertThat(bodies).hasSize(1);
		assertThat(bodies.get(0))
				.doesNotContain("\"instructions\"")
				.doesNotContain("file_search");
	}

	/**
	 * 강제하지 않는다 — {@code tool_choice} 를 보내지 않는다.
	 *
	 * <p>이 선택은 비용·지연 때문이다(단순 인사말에도 검색이 붙는 것을 피한다). 나중에 강제로 바꾸려면
	 * 이 케이스를 함께 고쳐야 하므로, <b>정책이 바뀌는 순간이 눈에 띈다.</b>
	 */
	@Test
	void does_not_force_tool_choice() {
		chat("shared-store");

		assertThat(bodies.get(0)).doesNotContain("tool_choice");
	}
}
