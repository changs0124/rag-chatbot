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

/**
 * Vector Store 계열 호출에 {@code OpenAI-Beta: assistants=v2} 가 실려 나가는지 검증함(#37).
 *
 * <p><b>왜 이렇게 재는가</b> - 헤더가 필수인지는 2026-09-22 실키로 판정됨(필수 아님, 실어도 무해). 그래도
 * 헤더는 공식 SDK 와 맞추려고 싣기로 했으므로, 그 선택이 유지되는지 <b>우리가 무엇을 보내는지</b>를
 * 로컬 서버로 받아 판정함. {@code OpenAiRealDeleteResourcesTest} 와 같은 방식임.
 *
 * <p>부착 범위가 새지 않는지도 함께 잠금 - {@code /files} 는 Assistants 베타와 무관하므로
 * 공식 SDK 도 헤더를 붙이지 않음. 기본 헤더로 올리면 이 테스트가 깨짐.
 */
class OpenAiRealBetaHeaderTest {

	// 타임아웃 3종은 이 테스트들의 관심사가 아니다 - 기본값과 같은 비율만 지킨다(#92)
	private static final long STREAM_READ_MS = 540_000;
	private static final long REQUEST_MS = 30_000;
	private static final long SSE_MS = 600_000;

	/** 관측한 요청 한 건. beta 가 null 이면 헤더가 없었다는 뜻 */
	private record Seen(String method, String path, String beta) {
		@Override
		public String toString() {
			return method + " " + path + "  OpenAI-Beta=" + (beta == null ? "(없음)" : beta);
		}
	}

	private static final String BETA = "assistants=v2";

	private HttpServer server;
	private final List<Seen> seen = new CopyOnWriteArrayList<>();
	private String baseUrl;

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", exchange -> {
			String method = exchange.getRequestMethod();
			String path = exchange.getRequestURI().getPath();
			seen.add(new Seen(method, path, exchange.getRequestHeaders().getFirst("OpenAI-Beta")));

			// 호출자가 응답 본문을 읽는 두 곳만 실물 형태로 돌려줌
			String body = null;
			if ("POST".equals(method) && "/files".equals(path)) {
				body = "{\"id\":\"file-1\"}";
			} else if ("GET".equals(method) && path.startsWith("/vector_stores/")) {
				body = "{\"status\":\"completed\"}";
			}

			if (body == null) {
				exchange.sendResponseHeaders(200, -1);
			} else {
				byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/json");
				exchange.sendResponseHeaders(200, bytes.length);
				exchange.getResponseBody().write(bytes);
			}
			exchange.close();
		});
		server.start();
		baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
	}

	@AfterEach
	void stopServer() {
		// 통과했을 때도 무엇이 나갔는지 남긴다 - 이 테스트의 판정 근거가 곧 관측 목록이라,
		// CI 리포트(system-out)만 보고도 어느 경로에 헤더가 붙었는지 알 수 있어야 함
		seen.forEach(s -> System.out.println("  " + s));
		server.stop(0);
	}

	private OpenAiRealService service() {
		return new OpenAiRealService("test-key", "gpt-4o", "shared-store", baseUrl, STREAM_READ_MS, REQUEST_MS, SSE_MS, null);
	}

	/** vector store 를 건드리는 네 경로를 모두 태움 */
	private void exerciseAllVectorStoreCalls() {
		var service = service();
		service.uploadDocument("a.pdf", new byte[] { 1 }, "application/pdf"); // POST /vector_stores/{id}/files
		service.documentStatus("shared-store", "file-1"); // GET  /vector_stores/{id}/files/{fid}
		service.deleteDocument("shared-store", "file-1"); // DEL  /vector_stores/{id}/files/{fid}
		service.deleteResources("conversation-store", List.of()); // DEL  /vector_stores/{id}
	}

	@Test
	void vector_store_calls_carry_the_assistants_beta_header() {
		exerciseAllVectorStoreCalls();

		List<Seen> vectorStoreCalls = seen.stream().filter(s -> s.path().startsWith("/vector_stores")).toList();

		assertThat(vectorStoreCalls)
				.withFailMessage("vector store 호출 4건이 모두 나가야 함 (관측: %s)", seen)
				.hasSize(4);
		assertThat(vectorStoreCalls)
				.withFailMessage("vector store 호출에 OpenAI-Beta: %s 가 빠짐 (관측: %s)", BETA, seen)
				.allMatch(s -> BETA.equals(s.beta()));
	}

	/** 공식 SDK 도 Files API 에는 붙이지 않음 - 기본 헤더로 올리면 여기서 걸림 */
	@Test
	void plain_file_calls_do_not_carry_the_header() {
		exerciseAllVectorStoreCalls();

		List<Seen> fileCalls = seen.stream().filter(s -> s.path().startsWith("/files")).toList();

		assertThat(fileCalls)
				.withFailMessage("Files API 호출이 관측되지 않음 (관측: %s)", seen)
				.isNotEmpty();
		assertThat(fileCalls)
				.withFailMessage("Files API 에 OpenAI-Beta 가 붙음 - 부착 범위가 샜음 (관측: %s)", seen)
				.allMatch(s -> s.beta() == null);
	}
}
