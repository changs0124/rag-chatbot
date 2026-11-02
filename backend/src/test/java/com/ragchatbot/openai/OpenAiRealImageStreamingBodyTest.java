package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

import com.ragchatbot.openai.OpenAiService.AttachmentRef;
import com.ragchatbot.openai.OpenAiService.ChatInput;
import com.ragchatbot.openai.OpenAiService.Turn;
import com.ragchatbot.storage.FileStorage;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 이미지 base64 를 본문을 쓰면서 흘려 넣어도(#552) 업스트림이 받는 JSON 이 전과 같은 모양인지 잼.
 *
 * <p>전에는 data URL 문자열을 map 에 넣어 Jackson 이 통째로 직렬화했다. 지금은 표식 자리에 파일을 흘리므로,
 * 자리를 잘못 계산하면 따옴표가 빠지거나 장 순서가 뒤바뀐 JSON 이 나간다 - 가짜 서버가 받은 본문을 파싱해 확인한다.
 */
class OpenAiRealImageStreamingBodyTest {

	private final ObjectMapper mapper = new ObjectMapper();
	private final AtomicReference<String> received = new AtomicReference<>();
	private final AtomicInteger requests = new AtomicInteger();
	private HttpServer server;

	@BeforeEach
	void startServer() throws Exception {
		server = OpenAiRealTestSupport.startFakeServer("/responses", ex -> {
			requests.incrementAndGet();
			received.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
			ex.getResponseHeaders().add("Content-Type", "text/event-stream");
			ex.sendResponseHeaders(200, 0);
			try (OutputStream out = ex.getResponseBody()) {
				out.write("data:{\"type\":\"response.completed\",\"response\":{\"output\":[]}}\n\n"
						.getBytes(StandardCharsets.UTF_8));
			}
		});
	}

	@AfterEach
	void stopServer() {
		server.stop(0);
	}

	private OpenAiRealService serviceWith(Map<String, Resource> files) {
		FileStorage storage = new FileStorage() {
			@Override
			public String store(UUID userId, String extension, byte[] content) {
				throw new UnsupportedOperationException();
			}

			@Override
			public Resource load(String storagePath) {
				return files.getOrDefault(storagePath, new FileSystemResource("does-not-exist-" + UUID.randomUUID()));
			}

			@Override
			public void delete(String storagePath) {
			}

			@Override
			public List<StoredFile> listAll() {
				return List.of();
			}

			@Override
			public long usedBytes(UUID userId) {
				return 0;
			}
		};
		return new OpenAiRealService("test-key", "gpt-6-sol", "vs_test", OpenAiRealTestSupport.baseUrl(server),
				540_000, 30_000, 600_000, storage);
	}

	@Test
	void images_are_inlined_as_data_urls_in_order_with_text_and_history_intact() {
		// 길이가 3의 배수가 아닌 것을 섞어 패딩까지 본다
		byte[] png = new byte[100_001];
		byte[] jpg = new byte[7];
		for (int i = 0; i < png.length; i++) {
			png[i] = (byte) i;
		}
		jpg[0] = 42;
		var service = serviceWith(Map.of("a.png", new ByteArrayResource(png), "b.jpg", new ByteArrayResource(jpg)));
		// 표식과 같은 모양의 사용자 텍스트가 있어도 자리로 오인하지 않는다
		String text = "질문 \"image-slot-x-0\" \\ 끝";

		service.streamChat(new ChatInput(text,
				List.of(new AttachmentRef("a.png", "image/png"), new AttachmentRef("b.jpg", "image/jpeg")),
				List.of(new Turn("user", "앞 질문"), new Turn("assistant", "앞 답"))),
				t -> {
				}, (s, src) -> {
				});

		JsonNode body = mapper.readTree(received.get());
		assertThat(body.path("model").asString("")).isEqualTo("gpt-6-sol");
		assertThat(body.path("stream").asBoolean(false)).isTrue();
		assertThat(body.path("instructions").asString("")).isEqualTo(OpenAiRealService.RAG_INSTRUCTIONS);
		JsonNode input = body.path("input");
		assertThat(input.size()).isEqualTo(3);
		assertThat(input.get(0).path("content").asString("")).isEqualTo("앞 질문");
		JsonNode content = input.get(2).path("content");
		assertThat(content.size()).isEqualTo(3);
		assertThat(content.get(0).path("text").asString("")).isEqualTo(text);
		assertThat(content.get(1).path("type").asString("")).isEqualTo("input_image");
		assertThat(content.get(1).path("image_url").asString(""))
				.isEqualTo("data:image/png;base64," + Base64.getEncoder().encodeToString(png));
		assertThat(content.get(2).path("image_url").asString(""))
				.isEqualTo("data:image/jpeg;base64," + Base64.getEncoder().encodeToString(jpg));
		// 표식은 하나도 남지 않는다 - 남은 것은 사용자 텍스트의 한 번뿐
		assertThat(received.get().split("image-slot-", -1)).hasSize(2);
	}

	@Test
	void missing_image_fails_before_any_request_is_sent() {
		var service = serviceWith(Map.of());

		assertThatThrownBy(() -> service.streamChat(
				new ChatInput("q", List.of(new AttachmentRef("gone.png", "image/png")), List.of()),
				t -> {
				}, (s, src) -> {
				}))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("첨부 이미지를 읽지 못함");
		assertThat(requests.get()).isZero();
	}
}
