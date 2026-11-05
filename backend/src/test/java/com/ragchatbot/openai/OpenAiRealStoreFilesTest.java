package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
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

	private HttpServer server;
	private final List<String> received = new CopyOnWriteArrayList<>();
	private OpenAiRealService service;
	private volatile boolean failFileLookup;
	private volatile String missingFile;
	/** 설정하면 /files/{id} 응답의 filename 을 이 JSON 문자열 본문으로 바꾼다(이스케이프 그대로 실음) */
	private volatile String filenameJson;

	@BeforeEach
	void startServer() throws IOException {
		server = OpenAiRealTestSupport.startFakeServer("/", exchange -> {
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
				if (id.equals(missingFile)) {
					reply(exchange, 404, "{\"error\":{\"message\":\"No such File object: " + id + "\"}}");
					return;
				}
				String name = filenameJson != null ? filenameJson : id + ".md";
				reply(exchange, 200, "{\"id\":\"" + id + "\",\"filename\":\"" + name + "\",\"bytes\":1234}");
			} else {
				reply(exchange, 404, "{}");
			}
		});
		service = OpenAiRealTestSupport.against(OpenAiRealTestSupport.baseUrl(server), "shared-store");
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

	/**
	 * TC-ADMIN-058 (#271) : File 이 없는(404) 스토어 연결은 예외가 아니라 {@code missing} 으로 돌려준다.
	 * 그 연결은 스토어에 남아 검색에 잡히는데, 종전처럼 던지면 고아 하나가 동기화 전체를 500 으로 멈춰 정리할 길이 없다
	 */
	@Test
	void file_gone_from_files_api_is_reported_as_missing() {
		missingFile = "file-b";

		List<StoreFile> files = service.listStoreFiles(id -> true);

		assertThat(files).contains(new StoreFile("file-b", "shared-store", null, 0, "missing"));
		assertThat(files).extracting(StoreFile::openaiFileId).containsExactly("file-a", "file-b", "file-c");
	}

	/**
	 * #613 : 파일명에 NUL(U+0000)이 있으면 지운 이름을 돌려준다 - 그대로 두면 동기화의 INSERT 를 PostgreSQL 이 거절해
	 * 그 파일이 스토어에 있는 한 동기화가 매번 실패한다(#610 과 같은 계열). 파일명은 JSON 이스케이프(백슬래시 u0000)로 실어 Jackson 이 실제 NUL 로 푼다
	 */
	@Test
	void nul_in_store_filename_is_dropped() {
		filenameJson = "매뉴\\u0000얼.md";

		List<StoreFile> files = service.listStoreFiles(id -> id.equals("file-b"));

		assertThat(files).contains(new StoreFile("file-b", "shared-store", "매뉴얼.md", 1234, "in_progress"));
	}

	/** #613 : NUL 만 있는 이름은 지우면 빈 이름이라 「파일명 없음」과 같게 던진다 - 빈 이름 행을 만들지 않는다 */
	@Test
	void nul_only_store_filename_is_treated_as_missing_name() {
		filenameJson = "\\u0000";

		assertThatThrownBy(() -> service.listStoreFiles(id -> id.equals("file-b")))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("파일명이 없음");
	}

	/** 404 가 아닌 실패는 여전히 던진다 - 일부만 돌려주면 동기화가 그것을 전부로 읽는다 */
	@Test
	void any_lookup_failure_throws_instead_of_returning_a_partial_list() {
		failFileLookup = true;

		assertThatThrownBy(() -> service.listStoreFiles(id -> true)).isInstanceOf(RuntimeException.class);
	}
}
