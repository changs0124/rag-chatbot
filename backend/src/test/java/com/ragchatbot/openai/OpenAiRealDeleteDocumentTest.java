package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

/**
 * 관리 화면 문서 삭제의 OpenAI 정리 (#271 · TC-ADMIN-055~057, 일시 장애 재시도 #476 · TC-ADMIN-062~065).
 *
 * <p>스토어 연결 해제 {@code DELETE /vector_stores/{vs}/files/{id}} 는 본문이 없어도 JSON 이 아닌 Content-Type 을
 * 400 으로 거절한다. JDK HttpURLConnection 은 DELETE 에 출력 스트림을 열면 form Content-Type 을 붙이므로, 그대로
 * 두면 해제가 늘 실패하고 {@code deleteQuietly} 가 그것을 삼켜 <b>지운 문서가 계속 검색된다</b>.
 * 이 서버는 OpenAI 와 같은 규칙으로 거절한다.
 */
class OpenAiRealDeleteDocumentTest {

	private HttpServer server;
	private final List<String> received = new CopyOnWriteArrayList<>();
	/** OpenAI 가 형식 때문에 거절했을 요청 - deleteQuietly 가 삼키므로 받은 목록만으로는 드러나지 않는다 */
	private final List<String> rejected = new CopyOnWriteArrayList<>();
	private volatile int detachStatus = 200;
	/** 앞에서부터 이 횟수만큼 503 을 돌려준다(#476) - 그 뒤는 위 상태 그대로 */
	private final AtomicInteger detachUnavailable = new AtomicInteger();
	private final AtomicInteger fileUnavailable = new AtomicInteger();
	private volatile int fileStatus = 200;
	private OpenAiRealService service;

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", exchange -> {
			String path = exchange.getRequestURI().getPath();
			String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
			received.add(exchange.getRequestMethod() + " " + path);
			int status = 200;
			if (path.startsWith("/vector_stores/")) {
				boolean badType = contentType != null && !contentType.startsWith("application/json");
				if (badType) {
					rejected.add(path + " (" + contentType + ")");
				}
				status = badType ? 400 : detachUnavailable.getAndDecrement() > 0 ? 503 : detachStatus;
			} else if (path.startsWith("/files/")) {
				status = fileUnavailable.getAndDecrement() > 0 ? 503 : fileStatus;
			}
			exchange.sendResponseHeaders(status, -1);
			exchange.close();
		});
		server.start();
		service = OpenAiRealTestSupport.against("http://127.0.0.1:" + server.getAddress().getPort(), "shared-store");
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
	}

	/** TC-ADMIN-055 : 연결 해제가 받아들여지는 형식으로 나가고, 이어서 File 을 지운다 */
	@Test
	void detaches_from_store_then_deletes_file() {
		service.deleteDocument("shared-store", "file-1");

		assertThat(received).containsExactly(
				"DELETE /vector_stores/shared-store/files/file-1",
				"DELETE /files/file-1");
		assertThat(rejected).withFailMessage("연결 해제가 형식 때문에 거절됨 : %s", rejected).isEmpty();
	}

	/**
	 * TC-ADMIN-056 : 연결 해제가 실패하면 File 을 지우지 않는다. File 만 지워지면 스토어에 이름 없는 연결이 남아
	 * 검색에는 계속 잡히는데 다시 지울 길이 없다. File 이 남아 있으면 동기화가 행을 되살려 다시 지울 수 있다
	 */
	@Test
	void keeps_file_when_detach_fails() {
		detachStatus = 500;

		service.deleteDocument("shared-store", "file-1");

		// 500 은 일시 장애로 보고 다시 보낸다(#476) - 끝내 실패해도 File 삭제로 넘어가지 않는다
		assertThat(received).containsOnly("DELETE /vector_stores/shared-store/files/file-1").hasSize(3);
	}

	/** TC-ADMIN-057 : 연결이 이미 없으면(404) 해제는 끝난 것이다 - File 은 지운다 */
	@Test
	void deletes_file_when_already_detached() {
		detachStatus = 404;

		service.deleteDocument("shared-store", "file-1");

		assertThat(received).containsExactly(
				"DELETE /vector_stores/shared-store/files/file-1",
				"DELETE /files/file-1");
	}

	/**
	 * TC-ADMIN-062 : 연결 해제 뒤 File 삭제가 일시 장애(503)면 다시 보낸다(#476). 그대로 두면 스토어 밖 File 이 남아
	 * 동기화로도 다시 보이지 않는다 - 10-26 운영에서 실제로 하나 남았다
	 */
	@Test
	void retries_file_delete_on_transient_failure() {
		fileUnavailable.set(2);

		service.deleteDocument("shared-store", "file-1");

		assertThat(received).containsExactly(
				"DELETE /vector_stores/shared-store/files/file-1",
				"DELETE /files/file-1",
				"DELETE /files/file-1",
				"DELETE /files/file-1");
	}

	/** TC-ADMIN-063 : 계속 503 이면 정해진 횟수(3번)에서 멈추고 던지지 않는다 - 삭제 흐름은 막지 않는다 */
	@Test
	void gives_up_after_bounded_attempts() {
		fileUnavailable.set(100);

		service.deleteDocument("shared-store", "file-1");

		assertThat(received).filteredOn(r -> r.equals("DELETE /files/file-1")).hasSize(3);
	}

	/** TC-ADMIN-064 : 연결 해제도 일시 장애면 다시 보내고, 해제되면 File 까지 지운다 */
	@Test
	void retries_detach_on_transient_failure() {
		detachUnavailable.set(1);

		service.deleteDocument("shared-store", "file-1");

		assertThat(received).containsExactly(
				"DELETE /vector_stores/shared-store/files/file-1",
				"DELETE /vector_stores/shared-store/files/file-1",
				"DELETE /files/file-1");
	}

	/** TC-ADMIN-065 : 일시 장애가 아닌 실패(4xx)는 다시 보내도 결과가 같으므로 한 번에 멈춘다 */
	@Test
	void does_not_retry_client_errors() {
		fileStatus = 400;

		service.deleteDocument("shared-store", "file-1");

		assertThat(received).filteredOn(r -> r.equals("DELETE /files/file-1")).hasSize(1);
	}
}
