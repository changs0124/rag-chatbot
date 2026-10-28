package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.ConnectException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.HttpClientErrorException;

import com.ragchatbot.exception.ApiExceptions.BadRequestException;
import com.ragchatbot.exception.ApiExceptions.UpstreamUnavailableException;
import com.sun.net.httpserver.HttpServer;

/**
 * 관리 화면 문서 업로드의 OpenAI 일시 장애 (#476 · TC-ADMIN-066~069, 429 · DNS · 내용 거절 · 연결 실패 정리 #479 · TC-ADMIN-070~072 · 074 · 075).
 *
 * <p>10-26 운영에서 {@code POST /files} 가 503 을 돌려줬을 때 폴백이 「처리되지 않은 예외」 ERROR 와 500 을 냈다.
 * 관리자에게는 다시 시도하면 되는 실패라는 것이 보여야 하므로 503 으로 알릴 예외로 바꾼다.
 */
class OpenAiRealUploadDocumentTest {

	private HttpServer server;
	private final List<String> received = new CopyOnWriteArrayList<>();
	private volatile int filesStatus = 200;
	private volatile int attachStatus = 200;
	/** 실패한 {@code POST /files} 가 싣는 본문(#479) - 기본은 원문이 새는지 보는 표식 */
	private volatile String filesErrorBody = "{\"error\":{\"message\":\"upstream-detail\"}}";
	/** 앞에서부터 이 횟수만큼 연결 해제에 503 을 돌려준다(#479) */
	private final AtomicInteger detachUnavailable = new AtomicInteger();
	private OpenAiRealService service;

	@BeforeEach
	void startServer() throws IOException {
		server = OpenAiRealTestSupport.startFakeServer("/", exchange -> {
			String line = exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath();
			received.add(line);
			int status = 200;
			byte[] body = new byte[0];
			if (line.equals("POST /files")) {
				status = filesStatus;
				// 실패 응답에는 업스트림 원문을 싣는다 - 그 원문이 관리자 응답으로 새지 않는지 본다(#479)
				body = (status == 200 ? "{\"id\":\"file-1\"}" : filesErrorBody).getBytes(StandardCharsets.UTF_8);
			} else if (line.startsWith("POST /vector_stores/")) {
				status = attachStatus;
			} else if (line.startsWith("DELETE /vector_stores/")) {
				status = detachUnavailable.getAndDecrement() > 0 ? 503 : 200;
			}
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
			if (body.length > 0) {
				exchange.getResponseBody().write(body);
			}
			exchange.close();
		});
		service = OpenAiRealTestSupport.against(OpenAiRealTestSupport.baseUrl(server), "shared-store");
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
				.isInstanceOf(UpstreamUnavailableException.class)
				.rootCause().isInstanceOf(ConnectException.class);
	}

	/**
	 * TC-ADMIN-069 : 읽기 타임아웃은 일시 장애(503 「다시 시도」)로 바꾸지 않는다. 요청은 닿았고 OpenAI 가 파일을 만들었는지
	 * 모른다 - 다시 시도를 권하면 관리자가 중복 파일을 만든다. 폴백(500 · ERROR)이 받아 상관 ID 로 추적한다
	 */
	@Test
	void read_timeout_is_not_reported_as_retryable() throws IOException {
		// 연결은 받되 응답을 끝내 보내지 않는 서버. 지금 요청 팩토리는 이것을 응답 읽기 실패(RestClientException)로 올리지만,
		// 클라이언트를 바꾸면 ResourceAccessException 으로 올 수 있다 - 어느 쪽이든 「다시 시도」 503 이면 안 된다
		try (ServerSocket silent = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
			OpenAiRealService impatient = OpenAiRealTestSupport.againstWithRequestTimeout(
					"http://127.0.0.1:" + silent.getLocalPort(), "shared-store", 300);

			assertThatThrownBy(() -> impatient.uploadDocument("a.md", "x".getBytes()))
					.isNotInstanceOf(UpstreamUnavailableException.class)
					.hasRootCauseInstanceOf(SocketTimeoutException.class);
		}
	}

	/**
	 * TC-ADMIN-068 : 스토어 연결이 503 이면 연결 해제 → File 삭제 순으로 정리한 뒤 같은 예외로 알린다(#479).
	 * 503 이어도 OpenAI 가 연결을 만들었을 수 있다 - File 만 지우면 스토어에 File 없는 연결이 남는다
	 */
	@Test
	void attach_5xx_cleans_up_file_then_reports_unavailable() {
		attachStatus = 503;

		assertThatThrownBy(() -> service.uploadDocument("a.md", "x".getBytes()))
				.isInstanceOf(UpstreamUnavailableException.class);
		assertThat(received).containsExactly(
				"POST /files",
				"POST /vector_stores/shared-store/files",
				"DELETE /vector_stores/shared-store/files/file-1",
				"DELETE /files/file-1");
	}

	/** TC-ADMIN-070 : Files 업로드가 429(속도 제한)면 일시 장애로 알린다(#479) - 다시 보내지 않는다 */
	@Test
	void files_429_is_upstream_unavailable_without_retry() {
		filesStatus = 429;

		assertThatThrownBy(() -> service.uploadDocument("a.md", "x".getBytes()))
				.isInstanceOf(UpstreamUnavailableException.class);
		assertThat(received).containsExactly("POST /files");
	}

	/** TC-ADMIN-071 : OpenAI 호스트 이름을 풀지 못해도(DNS 실패) 닿지 못한 것이다 - 일시 장애로 알린다(#479) */
	@Test
	void unknown_host_is_upstream_unavailable() {
		// .invalid 는 어디서도 풀리지 않도록 예약된 최상위 도메인(RFC 6761)
		OpenAiRealService unresolvable = OpenAiRealTestSupport.against("http://api.openai.invalid", "shared-store");

		assertThatThrownBy(() -> unresolvable.uploadDocument("a.md", "x".getBytes()))
				.isInstanceOf(UpstreamUnavailableException.class)
				.rootCause().isInstanceOf(UnknownHostException.class);
	}

	/**
	 * TC-ADMIN-072 : Files 업로드가 내용 때문에 거절되면(413 · 415) 고정 문구 400 으로 알린다(#479).
	 * 다시 시도해도 같으므로 503 이 아니고, 업스트림 원문은 응답에 싣지 않는다(WARN 로그에만).
	 * 400 은 우리 요청 형식이 틀린 경우와 갈리지 않아 넣지 않는다 - 예전처럼 폴백(500 · ERROR)으로 간다
	 */
	@Test
	void files_content_rejection_is_bad_request() {
		for (int status : new int[] {413, 415}) {
			filesStatus = status;

			assertThatThrownBy(() -> service.uploadDocument("a.md", "x".getBytes()))
					.as("POST /files %d", status)
					.isInstanceOf(BadRequestException.class)
					.hasMessageNotContaining("upstream-detail");
		}
		filesStatus = 400;

		assertThatThrownBy(() -> service.uploadDocument("a.md", "x".getBytes()))
				.as("POST /files 400")
				.isInstanceOf(HttpClientErrorException.BadRequest.class);
	}

	/**
	 * TC-ADMIN-074 : 스토어 연결 실패 뒤 연결 해제가 끝내 실패해도 File 삭제는 보낸다(#479). 업로드 경로에서는 연결이
	 * 남았더라도 동기화가 File 404 를 MISSING 으로 잡아 끊는다 - File 을 남기면 스토어 밖 고아가 된다
	 */
	@Test
	void attach_failure_deletes_file_even_if_detach_fails() {
		attachStatus = 503;
		detachUnavailable.set(100);

		assertThatThrownBy(() -> service.uploadDocument("a.md", "x".getBytes()))
				.isInstanceOf(UpstreamUnavailableException.class);
		assertThat(received).containsExactly(
				"POST /files",
				"POST /vector_stores/shared-store/files",
				"DELETE /vector_stores/shared-store/files/file-1",
				"DELETE /vector_stores/shared-store/files/file-1",
				"DELETE /vector_stores/shared-store/files/file-1",
				"DELETE /files/file-1");
	}

	/** TC-ADMIN-075 : 429 라도 할당량 소진(insufficient_quota)은 다시 시도해도 같다 - 일시 장애로 알리지 않는다(#479) */
	@Test
	void insufficient_quota_is_not_reported_as_retryable() {
		filesStatus = 429;
		filesErrorBody = "{\"error\":{\"code\":\"insufficient_quota\",\"message\":\"You exceeded your current quota\"}}";

		assertThatThrownBy(() -> service.uploadDocument("a.md", "x".getBytes()))
				.isInstanceOf(HttpClientErrorException.TooManyRequests.class);
		assertThat(received).containsExactly("POST /files");
	}
}
