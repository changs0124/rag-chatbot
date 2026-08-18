package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.ragchatbot.openai.OpenAiService.ChatInput;
import com.sun.net.httpserver.HttpServer;

/**
 * 스파이크 M3 : <b>동기형 {@code RestClient} 가 SSE 를 증분으로 흘려주는가.</b>
 *
 * <p>{@code OpenAiRealStageMappingTest} 는 캔드 {@code ByteArrayInputStream} 을 파서에 직접 먹이므로
 * <b>파싱 로직만</b> 검증함 - 이미 메모리에 다 있는 바이트라, RestClient 가 응답을 통째로 버퍼링하는지
 * 아닌지는 그 테스트로 드러나지 않음. 버퍼링한다면 라이브에서 토큰이 끝에 한꺼번에 도착해
 * <b>스트리밍이 조용히 죽는데 어떤 테스트도 빨간불이 되지 않음</b> - 그래서 이 스파이크가 있었음.
 *
 * <p>타이밍으로 재지 않고 <b>핸드셰이크</b>로 증명함 : 서버가 첫 delta 를 흘린 뒤 <b>클라이언트가
 * 그것을 받았다는 신호를 기다림</b>. 버퍼링이면 클라이언트는 응답이 끝나야 첫 토큰을 보므로 신호가
 * 오지 않고 서버가 대기하다 지나감 - 그 사실이 단언으로 드러남. 지연 시간에 기대지 않으므로
 * CI 부하와 무관하게 결정적임.
 */
class OpenAiRealStreamingSpikeTest {

	private HttpServer server;
	private final CountDownLatch firstTokenSeen = new CountDownLatch(1);
	private final AtomicBoolean serverSawSignal = new AtomicBoolean(false);

	@BeforeEach
	void startServer() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/responses", exchange -> {
			exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
			exchange.sendResponseHeaders(200, 0); // 0 = chunked, 길이 미리 안 알림
			try (OutputStream out = exchange.getResponseBody()) {
				write(out, "data:{\"type\":\"response.output_text.delta\",\"delta\":\"첫 조각\"}\n\n");

				// 클라이언트가 첫 토큰을 실제로 받았는지 기다림 - 버퍼링이면 영영 안 옴
				serverSawSignal.set(firstTokenSeen.await(5, TimeUnit.SECONDS));

				write(out, "data:{\"type\":\"response.output_text.delta\",\"delta\":\"둘째 조각\"}\n\n");
				write(out, "data:{\"type\":\"response.completed\",\"response\":{\"output\":[]}}\n\n");
				write(out, "data:[DONE]\n\n");
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
		});
		server.start();
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
	}

	private static void write(OutputStream out, String chunk) throws IOException {
		out.write(chunk.getBytes(StandardCharsets.UTF_8));
		out.flush(); // 청크를 즉시 내보냄 - 안 하면 이 테스트가 서버 쪽 버퍼링을 재게 됨
	}

	@Test
	void rest_client_delivers_sse_incrementally() {
		String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
		var service = new OpenAiRealService("test-key", "gpt-4o", "", baseUrl, null);
		List<String> tokens = new ArrayList<>();

		var result = service.streamChat(
				new ChatInput("질문", List.of(), null, List.of()),
				token -> {
					tokens.add(token);
					firstTokenSeen.countDown();
				},
				(stage, sources) -> {
				});

		// 핵심 단언 - 응답이 끝나기 전에 첫 토큰이 클라이언트에 도착했음
		assertThat(serverSawSignal)
				.withFailMessage("첫 delta 를 흘렸는데 클라이언트가 응답 종료 전에 받지 못함 "
						+ "= RestClient 가 응답을 통째로 버퍼링함(M3 스파이크의 무효화 조건)")
				.isTrue();

		assertThat(tokens).containsExactly("첫 조각", "둘째 조각");
		assertThat(result.fullText()).isEqualTo("첫 조각둘째 조각");
	}
}
