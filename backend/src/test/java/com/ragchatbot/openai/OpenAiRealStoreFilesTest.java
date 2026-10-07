package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.ragchatbot.openai.OpenAiService.StoreFile;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * 스토어 파일 목록(#193). 로컬 서버가 OpenAI 응답 형태를 흉내 내고, 무엇을 물었는지로 판정한다.
 *
 * <p>잠그는 것 : 페이지를 끝까지 읽는다 · 행이 있는 파일은 파일명을 묻지 않는다 · 하나라도 실패하면 던진다.
 */
class OpenAiRealStoreFilesTest {

	// 타임아웃 3종은 이 테스트들의 관심사가 아니다 - 기본값과 같은 비율만 지킨다(#92)
	private static final long STREAM_READ_MS = 540_000;
	private static final long REQUEST_MS = 30_000;
	private static final long SSE_MS = 600_000;

	private HttpServer server;
	private final List<String> received = new CopyOnWriteArrayList<>();
	private OpenAiRealService service;
	private volatile boolean failFileLookup;

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", exchange -> {
			String uri = exchange.getRequestURI().toString();
			received.add(uri);
			if (uri.equals("/vector_stores/shared-store/files?limit=100")) {
				reply(exchange, 200, """
						{"data":[{"id":"file-a","status":"completed"},{"id":"file-b","status":"in_progress"}],
						 "has_more":true,"last_id":"file-b"}""");
			} else if (uri.equals("/vector_stores/shared-store/files?limit=100&after=file-b")) {
				reply(exchange, 200, """
						{"data":[{"id":"file-c","status":"cancelled"}],"has_more":false,"last_id":"file-c"}""");
			} else if (uri.startsWith("/files/")) {
				if (failFileLookup) {
					reply(exchange, 500, "{}");
					return;
				}
				String id = uri.substring("/files/".length());
				reply(exchange, 200, "{\"id\":\"" + id + "\",\"filename\":\"" + id + ".md\",\"bytes\":1234}");
			} else {
				reply(exchange, 404, "{}");
			}
		});
		server.start();
		service = new OpenAiRealService("test-key", "gpt-4o", "shared-store",
				"http://127.0.0.1:" + server.getAddress().getPort(), STREAM_READ_MS, REQUEST_MS, SSE_MS, null);
	}

	private static void reply(HttpExchange exchange, int status, String body) throws IOException {
		byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().add("Content-Type", "application/json");
		exchange.sendResponseHeaders(status, bytes.length);
		exchange.getResponseBody().write(bytes);
		exchange.close();
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
	}

	@Test
	void reads_every_page_and_looks_up_names_only_for_files_without_rows() {
		List<StoreFile> files = service.listStoreFiles(id -> !id.equals("file-a"));

		assertThat(files).containsExactly(
				new StoreFile("file-a", "shared-store", null, 0, "completed"),
				new StoreFile("file-b", "shared-store", "file-b.md", 1234, "in_progress"),
				// 모르는 상태(cancelled)를 completed 로 넘기지 않는다 - documentStatus 와 같은 어휘
				new StoreFile("file-c", "shared-store", "file-c.md", 1234, "failed"));
		assertThat(received).doesNotContain("/files/file-a");
	}

	@Test
	void any_lookup_failure_throws_instead_of_returning_a_partial_list() {
		failFileLookup = true;

		assertThatThrownBy(() -> service.listStoreFiles(id -> true)).isInstanceOf(RuntimeException.class);
	}
}
