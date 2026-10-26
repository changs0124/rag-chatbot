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

import com.ragchatbot.exception.ApiExceptions.UpstreamUnavailableException;
import com.sun.net.httpserver.HttpServer;

/**
 * 관리 화면 문서 업로드의 OpenAI 일시 장애 (#476 · TC-ADMIN-066~068).
 *
 * <p>10-26 운영에서 {@code POST /files} 가 503 을 돌려줬을 때 폴백이 「처리되지 않은 예외」 ERROR 와 500 을 냈다.
 * 관리자에게는 다시 시도하면 되는 실패라는 것이 보여야 하므로 503 으로 알릴 예외로 바꾼다.
 */
class OpenAiRealUploadDocumentTest {

	private HttpServer server;
	private final List<String> received = new CopyOnWriteArrayList<>();
	private volatile int filesStatus = 200;
	private volatile int attachStatus = 200;
	private OpenAiRealService service;

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", exchange -> {
			String line = exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath();
			received.add(line);
			int status = 200;
			byte[] body = new byte[0];
			if (line.equals("POST /files")) {
				status = filesStatus;
				body = "{\"id\":\"file-1\"}".getBytes(StandardCharsets.UTF_8);
			} else if (line.startsWith("POST /vector_stores/")) {
				status = attachStatus;
			}
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
			if (body.length > 0) {
				exchange.getResponseBody().write(body);
			}
			exchange.close();
		});
		server.start();
		service = OpenAiRealTestSupport.against("http://127.0.0.1:" + server.getAddress().getPort(), "shared-store");
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
	}

	/** TC-ADMIN-066 : Files 업로드가 503 이면 일시 장애 예외로 알리고, POST 는 다시 보내지 않는다(중복 파일 위험) */
	@Test
	void files_5xx_is_upstream_unavailable_without_retry() {
		filesStatus = 503;

		assertThatThrownBy(() -> service.uploadDocument("a.md", "x".getBytes()))
				.isInstanceOf(UpstreamUnavailableException.class);
		assertThat(received).containsExactly("POST /files");
	}

	/** TC-ADMIN-067 : OpenAI 에 닿지 못해도(연결 거절) 같은 예외다 */
	@Test
	void connection_refused_is_upstream_unavailable() {
		OpenAiRealService unreachable = OpenAiRealTestSupport.against("http://127.0.0.1:1", "shared-store");

		assertThatThrownBy(() -> unreachable.uploadDocument("a.md", "x".getBytes()))
				.isInstanceOf(UpstreamUnavailableException.class);
	}

	/** TC-ADMIN-068 : 스토어 연결이 503 이면 올린 File 을 지운 뒤 같은 예외로 알린다 - 고아 File 을 남기지 않는다 */
	@Test
	void attach_5xx_cleans_up_file_then_reports_unavailable() {
		attachStatus = 503;

		assertThatThrownBy(() -> service.uploadDocument("a.md", "x".getBytes()))
				.isInstanceOf(UpstreamUnavailableException.class);
		assertThat(received).containsExactly(
				"POST /files",
				"POST /vector_stores/shared-store/files",
				"DELETE /files/file-1");
	}
}
