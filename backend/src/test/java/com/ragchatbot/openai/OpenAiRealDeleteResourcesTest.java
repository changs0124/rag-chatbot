package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

/**
 * 대화 삭제 시 OpenAI 리소스 정리(AC-12)가 <b>설정된 base-url 로</b> 나가는지 검증함.
 *
 * <p>종전에는 삭제 경로만 절대 URL(api.openai.com)이 박혀 있어 {@code app.openai.base-url} 이
 * 그 경로에서만 죽어 있었음 - 스파이크·대체 엔드포인트로 돌려도 삭제만 실 API 로 나갔음.
 * {@code deleteQuietly} 는 실패를 삼키므로 잘못 나가도 예외로 드러나지 않음 - 그래서
 * <b>로컬 서버가 무엇을 받았는지</b>로 판정함.
 */
class OpenAiRealDeleteResourcesTest {

	private HttpServer server;
	private final List<String> received = new CopyOnWriteArrayList<>();
	private String baseUrl;

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", exchange -> {
			received.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
			exchange.sendResponseHeaders(200, -1);
			exchange.close();
		});
		server.start();
		baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
	}

	@Test
	void deletes_files_and_conversation_store_through_configured_base_url() {
		var service = new OpenAiRealService("test-key", "gpt-4o", "shared-store", baseUrl, null);

		service.deleteResources("conversation-store", List.of("file-1", "file-2"));

		assertThat(received)
				.withFailMessage("삭제 요청이 설정된 base-url 로 오지 않음 - 절대 URL 이 박혀 있는지 확인할 것 (받은 것: %s)",
						received)
				.containsExactlyInAnyOrder(
						"DELETE /files/file-1",
						"DELETE /files/file-2",
						"DELETE /vector_stores/conversation-store");
	}

	/** 공용 Store 는 다른 대화도 함께 쓰므로 절대 지우지 않음 */
	@Test
	void never_deletes_the_shared_vector_store() {
		var service = new OpenAiRealService("test-key", "gpt-4o", "shared-store", baseUrl, null);

		service.deleteResources("shared-store", List.of());

		assertThat(received).isEmpty();
	}
}
