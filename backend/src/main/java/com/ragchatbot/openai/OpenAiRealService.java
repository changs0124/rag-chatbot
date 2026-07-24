package com.ragchatbot.openai;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ragchatbot.storage.FileStorage;

/**
 * 실 OpenAI 연동(APP_MODE=live). RestClient 직접 호출(1단계 채택) + Responses API 스트리밍.
 *
 * <p>구조 : Responses API(gpt-4o) + 공용 Vector Store 기반 file_search + 이미지 비전 입력(base64) +
 * 스트리밍 토큰 → onToken + 응답 annotations(file_citation) → CitationData. 무자료(인용 0건) 시
 * 규정 접두(P-8, {@link OpenAiMockService#NO_SOURCE_PREFIX}).
 *
 * <p><b>주의(S-1)</b> : 실호출 검증은 OPENAI_API_KEY·공용 Store 확보 후 M2 스파이크에서 수행함(미결 표).
 * 현재는 컴파일·구조만 검증된 상태이며, 실 응답 스키마와 무자료 임계는 실물로 확인 전까지 완성으로 위장하지 않음.
 * 특히 무자료 접두는 스트림 종료 후에야 인용 유무를 알 수 있어, 라이브 토큰 순서상 접두가 저장 텍스트에만 반영됨
 * (프론트 표기 방식은 M2에서 확정).
 */
@Service
@ConditionalOnProperty(prefix = "app", name = "mode", havingValue = "live")
public class OpenAiRealService implements OpenAiService {

	private static final Logger log = LoggerFactory.getLogger(OpenAiRealService.class);

	private final RestClient client;
	private final ObjectMapper mapper = new ObjectMapper();
	private final FileStorage fileStorage;
	private final String model;
	private final String sharedVectorStoreId;

	public OpenAiRealService(
			@Value("${app.openai.api-key:}") String apiKey,
			@Value("${app.openai.model:gpt-4o}") String model,
			@Value("${app.openai.vector-store-id:}") String vectorStoreId,
			FileStorage fileStorage) {
		this.model = model;
		this.sharedVectorStoreId = vectorStoreId;
		this.fileStorage = fileStorage;
		// 스트리밍이라 read timeout은 넉넉히. connect는 짧게 잡아 장애 시 빨리 실패시킴
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(Duration.ofSeconds(5));
		factory.setReadTimeout(Duration.ofMinutes(10));
		this.client = RestClient.builder()
				.requestFactory(factory)
				.baseUrl("https://api.openai.com/v1")
				.defaultHeader("Authorization", "Bearer " + apiKey)
				.build();
	}

	@Override
	public ChatCompletion streamChat(ChatInput input, Consumer<String> onToken) {
		String storeId = (input.vectorStoreId() != null && !input.vectorStoreId().isBlank())
				? input.vectorStoreId()
				: sharedVectorStoreId;

		Map<String, Object> body = new HashMap<>();
		body.put("model", model);
		body.put("input", buildInput(input));
		body.put("stream", true);
		// 공용 Store 미설정이면 file_search 없이 일반 응답(출처 빈 리스트 → 무자료 접두)
		if (storeId != null && !storeId.isBlank()) {
			body.put("tools", List.of(Map.of(
					"type", "file_search",
					"vector_store_ids", List.of(storeId))));
			// 스니펫 노출을 위해 검색 결과 본문까지 받음
			body.put("include", List.of("file_search_call.results"));
		}

		return client.post()
				.uri(URI.create("https://api.openai.com/v1/responses"))
				.contentType(MediaType.APPLICATION_JSON)
				.accept(MediaType.TEXT_EVENT_STREAM)
				.body(body)
				.exchange((request, response) -> {
					if (response.getStatusCode().isError()) {
						String detail = new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
						log.warn("openai responses api error {}: {}", response.getStatusCode(), detail);
						throw new IllegalStateException("OpenAI 응답 생성 실패");
					}
					return consumeStream(response.getBody(), onToken);
				});
	}

	/** 이미지 첨부가 있으면 비전 입력(구조화 content), 없으면 단순 문자열 입력 */
	private Object buildInput(ChatInput input) {
		String text = input.userMessage() == null ? "" : input.userMessage();
		List<AttachmentRef> images = input.attachments() == null ? List.of()
				: input.attachments().stream().filter(a -> "image".equals(a.fileType())).toList();
		if (images.isEmpty()) {
			return text;
		}
		List<Map<String, Object>> content = new ArrayList<>();
		content.add(Map.of("type", "input_text", "text", text));
		for (AttachmentRef img : images) {
			content.add(Map.of("type", "input_image", "image_url", toDataUrl(img)));
		}
		return List.of(Map.of("role", "user", "content", content));
	}

	/** 로컬 디스크 이미지를 data URL(base64)로. 문서는 공용 Store에서만 검색되므로 인라인하지 않음 */
	private String toDataUrl(AttachmentRef img) {
		try (InputStream is = fileStorage.load(img.storagePath()).getInputStream()) {
			byte[] bytes = is.readAllBytes();
			return "data:" + mimeFromPath(img.storagePath()) + ";base64,"
					+ Base64.getEncoder().encodeToString(bytes);
		} catch (Exception e) {
			throw new IllegalStateException("첨부 이미지를 읽지 못함: " + img.storagePath(), e);
		}
	}

	private static String mimeFromPath(String path) {
		String p = path.toLowerCase();
		if (p.endsWith(".png")) return "image/png";
		if (p.endsWith(".webp")) return "image/webp";
		if (p.endsWith(".gif")) return "image/gif";
		return "image/jpeg";
	}

	/** Responses API SSE를 읽어 토큰을 흘리고, 완료 이벤트에서 출처를 추출함 */
	private ChatCompletion consumeStream(InputStream in, Consumer<String> onToken) {
		StringBuilder buffer = new StringBuilder();
		List<CitationData> citations = List.of();
		try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
			String line;
			while ((line = reader.readLine()) != null) {
				if (!line.startsWith("data:")) {
					continue;
				}
				String payload = line.substring(5).trim();
				if (payload.isEmpty() || "[DONE]".equals(payload)) {
					continue;
				}
				JsonNode ev = mapper.readTree(payload);
				String type = ev.path("type").asText();
				if ("response.output_text.delta".equals(type)) {
					String delta = ev.path("delta").asText();
					buffer.append(delta);
					onToken.accept(delta);
				} else if ("response.completed".equals(type)) {
					citations = extractCitations(ev.path("response"));
				}
			}
		} catch (RuntimeException e) {
			throw e; // 중단 신호를 그대로 전파(ChatService가 error 상태로 저장)
		} catch (Exception e) {
			throw new IllegalStateException("OpenAI 스트림 읽기 오류", e);
		}

		boolean noSource = citations.isEmpty();
		String fullText = noSource
				? OpenAiMockService.NO_SOURCE_PREFIX + buffer
				: buffer.toString();
		return new ChatCompletion(fullText, citations, noSource);
	}

	/**
	 * output[]을 훑어 file_search 결과(파일명 → 스니펫)를 모으고, 본문 annotation이 실제 인용한 파일만
	 * 골라 출처로 만듦. 검색은 됐지만 인용되지 않은 파일은 제외함. 각주 번호(seq)는 인용 순서(1-base).
	 */
	private List<CitationData> extractCitations(JsonNode response) {
		Map<String, String> snippetByFile = new HashMap<>();
		Map<String, Boolean> citedFiles = new LinkedHashMap<>(); // 순서 유지 + 중복 제거

		for (JsonNode item : response.path("output")) {
			if ("file_search_call".equals(item.path("type").asText())) {
				for (JsonNode r : item.path("results")) {
					String name = r.path("filename").asText();
					if (!name.isEmpty()) {
						snippetByFile.putIfAbsent(name, r.path("text").asText(""));
					}
				}
			}
			for (JsonNode content : item.path("content")) {
				for (JsonNode ann : content.path("annotations")) {
					if ("file_citation".equals(ann.path("type").asText())) {
						String name = ann.path("filename").asText();
						if (!name.isEmpty()) {
							citedFiles.putIfAbsent(name, Boolean.TRUE);
						}
					}
				}
			}
		}

		List<CitationData> citations = new ArrayList<>();
		int seq = 1;
		for (String name : citedFiles.keySet()) {
			String snippet = truncate(snippetByFile.getOrDefault(name, ""));
			citations.add(new CitationData(seq++, name, snippet, null));
		}
		return citations;
	}

	/** 출처 스니펫을 버블 분량으로 제한(UI 2줄 클램프보다 조금 넉넉하게) */
	private static String truncate(String s) {
		if (s == null) {
			return "";
		}
		String flat = s.replaceAll("\\s+", " ").trim();
		return flat.length() <= 200 ? flat : flat.substring(0, 200) + "…";
	}

	/**
	 * 대화 삭제 시 OpenAI 리소스 정리(AC-12). 공용 Store는 절대 삭제하지 않음.
	 * 대화별 업로드 파일(openaiFileId)만 삭제하고, 대화 전용 스토어(공용과 다른 경우)만 삭제함.
	 */
	@Override
	public void deleteResources(String vectorStoreId, List<String> openaiFileIds) {
		if (openaiFileIds != null) {
			for (String fileId : openaiFileIds) {
				if (fileId != null && !fileId.isBlank()) {
					deleteQuietly("/files/" + fileId, "file", fileId);
				}
			}
		}
		// 공용 Store 보호 : 대화 전용 스토어이면서 공용과 다를 때만 삭제
		if (vectorStoreId != null && !vectorStoreId.isBlank()
				&& !vectorStoreId.equals(sharedVectorStoreId)) {
			deleteQuietly("/vector_stores/" + vectorStoreId, "vector_store", vectorStoreId);
		}
	}

	private void deleteQuietly(String path, String kind, String id) {
		try {
			client.delete().uri(URI.create("https://api.openai.com/v1" + path)).retrieve().toBodilessEntity();
		} catch (Exception e) {
			// 정리 실패는 삭제 흐름을 막지 않음(고아 리소스는 별도 정리)
			log.warn("openai {} 삭제 실패 {}: {}", kind, id, e.getMessage());
		}
	}
}
