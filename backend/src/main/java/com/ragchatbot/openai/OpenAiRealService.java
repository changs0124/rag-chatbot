package com.ragchatbot.openai;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.ragchatbot.storage.FileStorage;

/**
 * 실 OpenAI 연동(APP_MODE=live). RestClient 직접 호출(1단계 채택) + Responses API 스트리밍.
 *
 * <p>구조 : Responses API(gpt-4o) + 공용 Vector Store 기반 file_search + 이미지 비전 입력(base64) +
 * 스트리밍 토큰 → onToken + 응답 annotations(file_citation) → CitationData. 무자료(인용 0건)는
 * 텍스트를 건드리지 않고 {@code noSource} 플래그로만 알림(P-8) - 인용 0건은 스트림이 끝나야 알 수 있어
 * 이미 보낸 토큰 앞에 접두를 붙일 수 없기 때문임.
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

	/**
	 * Vector Store 계열 호출에만 싣는 베타 헤더(#37).
	 *
	 * <p><b>왜 붙이는가</b> — 공식 {@code openai-python} 의 {@code resources/vector_stores/} 는
	 * vector_stores 와 그 하위 files 의 <b>모든</b> 메서드(create · retrieve · update · list · delete ·
	 * search)에서 이 헤더를 주입하고, 공식 API 레퍼런스의 curl 예시에도 들어 있다. 우리만 빼고 부르고 있었다.
	 *
	 * <p><b>필수는 아니다</b>(2026-09-22 실키 판정) — 헤더 <b>없이</b> 목록 조회 · 파일 연결 · 상태 조회 ·
	 * 연결 해제를 실제로 불러 전부 200 이었다. 헤더를 <b>실은</b> 이 구현으로도 업로드 → completed · 삭제가
	 * 정상이라 보내서 생기는 문제도 없다. 그래서 이 헤더는 "없으면 막혀서" 가 아니라 <b>문서화된 계약(SDK ·
	 * API 레퍼런스)과 맞추려고</b> 남긴다. 판정 기록은 이슈 #37 에 있다.
	 *
	 * <p><b>왜 기본 헤더가 아닌가</b> — 기본 헤더로 올리면 {@code /responses} 와 {@code /files} 에도 함께
	 * 나간다. SDK 는 그 둘에 붙이지 않으며, 부작용 여부는 키가 없어 확인할 수 없다. 근거가 있는 범위에만
	 * 붙인다. 이 경계는 {@code OpenAiRealBetaHeaderTest} 가 양방향으로 잠근다.
	 */
	private static final String OPENAI_BETA_ASSISTANTS_V2 = "assistants=v2";

	/** 스트리밍({@code /responses}) 전용. 읽기 타임아웃이 길다 */
	private final RestClient streamClient;
	/** 그 밖의 모든 호출(문서 업로드·상태·삭제). 읽기 타임아웃이 짧다 */
	private final RestClient client;
	private final ObjectMapper mapper = new ObjectMapper();
	private final FileStorage fileStorage;
	private final String model;
	private final String sharedVectorStoreId;

	/**
	 * 검색 도구가 붙은 턴에 함께 보내는 지시(#39).
	 *
	 * <p><b>왜 필요한가</b> — {@code tool_choice} 를 주지 않으면 기본값이 {@code auto} 라 file_search 호출
	 * 여부가 모델 재량이다. 모델이 "일반 지식으로 답할 수 있다" 고 판단해 검색을 건너뛰면 annotation 이
	 * 0건이 되고, {@code noSource = citations.isEmpty()} 가 true 가 되어 화면에 「자료 없음」이 뜬다.
	 * 스토어에 분명히 있는 내용을 물어도 그렇게 될 수 있다.
	 *
	 * <p><b>왜 강제하지 않는가</b> — {@code tool_choice} 로 file_search 를 강제하면 근거 부착률은 오르지만
	 * 단순 인사말에도 검색이 붙어 턴당 비용과 응답 지연이 는다. 프롬프트로 유도하되 강제하지 않는 쪽을
	 * 골랐다. 편차가 남는 것은 아는 대가이며, 실 연동에서 부착률을 재 본 뒤 다시 판단한다.
	 *
	 * <p>env 로 빼지 않았다. 지금은 정책이 하나뿐이고, 값을 바꿔 가며 운영할 이유가 아직 없다.
	 */
	static final String RAG_INSTRUCTIONS = """
			너는 사내 문서를 근거로 답하는 도우미다.

			- 질문에 답하기 전에 file_search 로 사내 문서를 먼저 찾아본다. 사내 규정·절차·제도처럼 \
			조직마다 다른 내용은 일반 지식으로 답하지 말고 반드시 검색 결과에 근거한다.
			- 검색 결과에 근거가 있으면 그 내용만으로 답하고, 어느 문서에서 왔는지 알 수 있게 인용을 남긴다.
			- 검색해도 근거를 찾지 못했으면 **찾지 못했다고 먼저 밝힌 뒤** 일반적인 설명을 덧붙인다. \
			근거가 없는 내용을 사내 규정인 것처럼 말하지 않는다.
			- 한국어로 답한다.
			""";

	public OpenAiRealService(
			@Value("${app.openai.api-key:}") String apiKey,
			@Value("${app.openai.model:gpt-4o}") String model,
			@Value("${app.openai.vector-store-id:}") String vectorStoreId,
			@Value("${app.openai.base-url:https://api.openai.com/v1}") String baseUrl,
			@Value("${app.openai.stream-read-timeout-ms:540000}") long streamReadTimeoutMs,
			@Value("${app.openai.request-timeout-ms:30000}") long requestTimeoutMs,
			@Value("${app.chat.sse-timeout-ms:600000}") long sseTimeoutMs,
			FileStorage fileStorage) {
		// live 모드인데 키가 비면 부팅 즉시 실패(per-request 401 대신 fail-fast). 이 빈은 app.mode=live에서만 로드됨
		if (apiKey == null || apiKey.isBlank()) {
			throw new IllegalStateException(
					"APP_MODE=live 인데 OPENAI_API_KEY 가 비어 있음. 실 연동 키를 env로 주입할 것");
		}
		// **워커가 emitter 보다 오래 살면 안 됨**(#76·#92). 부등식이 깨지면 emitter 가 타임아웃으로
		// 죽은 뒤에도 워커가 읽기에 붙어 있어, 그동안 스레드와 동시 스트림 권한이 함께 잡힌다 -
		// 화면에는 아무 스트림도 없는데 "이미 응답을 받는 중" 429 를 받는다. 종전에는 두 값이
		// 정확히 같아(둘 다 10분) 결말이 밀리초 경합이었다
		if (streamReadTimeoutMs >= sseTimeoutMs) {
			throw new IllegalStateException(
					"app.openai.stream-read-timeout-ms(" + streamReadTimeoutMs + ") 는 "
							+ "app.chat.sse-timeout-ms(" + sseTimeoutMs + ") 보다 작아야 함 - "
							+ "크면 SSE 스트림이 끝난 뒤에도 워커가 자원을 붙잡는다");
		}
		this.model = model;
		this.sharedVectorStoreId = vectorStoreId;
		this.fileStorage = fileStorage;
		// **클라이언트를 둘로 나눈다**(#92). 종전에는 하나뿐이라 스트리밍용 10분이 문서 상태 조회 ·
		// 업로드 · 삭제에도 그대로 걸렸다 - in_progress 3건이면 관리자 목록 요청 하나가 최대 30분,
		// 첨부 5개 대화 삭제가 최대 50분 톰캣 스레드를 잡았다. 그 값은 스트리밍으로만 정당화된다
		this.streamClient = restClient(baseUrl, apiKey, Duration.ofMillis(streamReadTimeoutMs));
		this.client = restClient(baseUrl, apiKey, Duration.ofMillis(requestTimeoutMs));
	}

	/** connect 는 짧게 잡아 장애 시 빨리 실패시킴. read 만 용도별로 다르다 */
	private static RestClient restClient(String baseUrl, String apiKey, Duration readTimeout) {
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(Duration.ofSeconds(5));
		factory.setReadTimeout(readTimeout);
		return RestClient.builder()
				.requestFactory(factory)
				// 기본값이 실 엔드포인트임. 설정으로 뺀 이유는 **증분 수신을 실 코드 경로로 잴 수 있게**
				// 하려는 것임(M3 스파이크) - 캔드 InputStream 으로는 RestClient 가 응답을 통째로
				// 버퍼링하는지 아닌지가 드러나지 않음
				.baseUrl(baseUrl)
				.defaultHeader("Authorization", "Bearer " + apiKey)
				.build();
	}

	/** 라이브 단계 라벨(R-11). 목업과 달리 실제 file_search 결과에 근거하므로 실 문구를 씀 */
	private static final Map<Stage, String> STAGE_LABELS = Map.of(
			Stage.ANALYZING, "질문 분석 중",
			Stage.SEARCHING, "참조 문서 검색 중",
			Stage.GENERATING, "답변 작성 중");

	/**
	 * sources는 라이브에서 늘 비어 있음. 검색 단계는 file_search 호출이 <b>시작됐다는</b> 이벤트에 올리는데
	 * 그 시점에는 어느 문서가 걸렸는지 아직 모르고, 파일명은 response.completed 의 결과에서야 나옴 -
	 * 즉 이미 토큰이 나간 뒤라 단계 라벨에 실을 수 없음(R-11 전송 규칙). 없는 이름을 지어내지 않고 비워 둠(P-10)
	 */
	@Override
	public String stageLabel(Stage stage, List<String> sources) {
		return STAGE_LABELS.get(stage);
	}

	@Override
	public ChatCompletion streamChat(ChatInput input, Consumer<String> onToken, BiConsumer<Stage, List<String>> onStage) {
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
			// 검색 도구가 붙을 때만 지시를 싣는다 - 스토어가 없으면 근거를 찾으라는 말이 거짓이 된다
			body.put("instructions", RAG_INSTRUCTIONS);
		}

		return streamClient.post()
				// 상대 경로여야 빌더의 baseUrl 이 적용됨. 종전에는 절대 URI 라 baseUrl 이 죽은 설정이었음
				.uri("/responses")
				.contentType(MediaType.APPLICATION_JSON)
				.accept(MediaType.TEXT_EVENT_STREAM)
				.body(body)
				.exchange((request, response) -> {
					if (response.getStatusCode().isError()) {
						String detail = new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
						log.warn("openai responses api error {}: {}", response.getStatusCode(), detail);
						throw new IllegalStateException("OpenAI 응답 생성 실패");
					}
					return consumeStream(response.getBody(), onToken, onStage);
				});
	}

	/**
	 * 입력 구성. 이력도 이미지도 없으면 문자열 하나(가장 단순한 형태), 그 외에는 메시지 배열.
	 *
	 * <p>이력 턴은 <b>문자열 content</b> 로만 보냄 - 과거 이미지는 재전송하지 않기로 했고
	 * (턴이 쌓일수록 비용이 폭증함), 자리표시자는 ChatService 가 이미 텍스트에 넣어 둠.
	 * 구조화 content(비전 입력)는 <b>이번 턴에만</b> 씀.
	 */
	private Object buildInput(ChatInput input) {
		String text = input.userMessage() == null ? "" : input.userMessage();
		List<AttachmentRef> images = input.attachments() == null ? List.of()
				: input.attachments().stream().filter(a -> "image".equals(a.fileType())).toList();
		List<Turn> history = input.history() == null ? List.of() : input.history();

		if (history.isEmpty() && images.isEmpty()) {
			return text;
		}

		List<Map<String, Object>> items = new ArrayList<>();
		for (Turn turn : history) {
			items.add(Map.of("role", turn.role(), "content", turn.content()));
		}
		if (images.isEmpty()) {
			items.add(Map.of("role", "user", "content", text));
		} else {
			List<Map<String, Object>> content = new ArrayList<>();
			content.add(Map.of("type", "input_text", "text", text));
			for (AttachmentRef img : images) {
				content.add(Map.of("type", "input_image", "image_url", toDataUrl(img)));
			}
			items.add(Map.of("role", "user", "content", content));
		}
		return items;
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

	/**
	 * Responses API SSE를 읽어 토큰을 흘리고, 완료 이벤트에서 출처를 추출함.
	 * 진행 단계(R-11)는 실제 도착한 이벤트에만 근거함 - file_search 이벤트가 없으면 검색 단계도 없음(P-10, AC-24).
	 */
	// 패키지 가시성 : 캔드 스트림으로 단계 매핑을 단위 테스트함(실 호출 없이 AC-24 검증)
	ChatCompletion consumeStream(InputStream in, Consumer<String> onToken, BiConsumer<Stage, List<String>> onStage) {
		StringBuilder buffer = new StringBuilder();
		List<CitationData> citations = List.of();
		// 사용량은 완료 이벤트에서만 옴. 못 받으면 null 로 남겨 "모르는 것"을 0 과 구분함(FEAT-OPS-001)
		Integer inputTokens = null;
		Integer outputTokens = null;
		boolean completed = false;
		boolean searchingSent = false;
		boolean generatingSent = false;
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
				// **기본값을 반드시 준다.** Jackson 3 의 인자 없는 접근자는 Object·Array 노드에서
				// 예외를 던진다(Jackson 2 는 "" 를 돌려줬음). 여기서 던지면 모르는 모양의 이벤트 하나가
				// 스트림 전체를 죽인다 - 예전에는 아래 if/else 사슬을 그냥 빠져나가 무해하게 무시됐다.
				// 업스트림 스키마가 넓어져도 조용히 넘어가는 쪽이 맞다(#63)
				String type = ev.path("type").asString("");
				if ("response.output_text.delta".equals(type)) {
					String delta = ev.path("delta").asString("");
					if (!generatingSent) {
						onStage.accept(Stage.GENERATING, List.of()); // 첫 토큰 직전이 생성 경계임
						generatingSent = true;
					}
					buffer.append(delta);
					onToken.accept(delta);
				} else if (!searchingSent && ("response.file_search_call.in_progress".equals(type)
						|| "response.file_search_call.searching".equals(type))) {
					// 실제 file_search 호출이 시작된 근거가 있을 때만 검색 단계를 보냄(AC-24).
					// 이 시점에는 어느 문서가 걸렸는지 아직 모르므로 자료명은 비워 보냄(stageLabel 주석 참고)
					onStage.accept(Stage.SEARCHING, List.of());
					searchingSent = true;
				} else if ("response.completed".equals(type)) {
					JsonNode response = ev.path("response");
					citations = extractCitations(response);
					inputTokens = intOrNull(response.path("usage"), "input_tokens");
					outputTokens = intOrNull(response.path("usage"), "output_tokens");
					completed = true;
				}
			}
		} catch (RuntimeException e) {
			throw e; // 중단 신호를 그대로 전파(ChatService가 중단인지 오류인지 구분해 저장)
		} catch (Exception e) {
			throw new IllegalStateException("OpenAI 스트림 읽기 오류", e);
		}

		// 완료 이벤트 없이 스트림이 끝나면 업스트림 실패를 무자료 성공으로 위장하지 않고 오류로 처리.
		// (M2 : 실 API의 완료 이벤트명이 다르면 여기서 드러남 - 조용히 무자료로 넘어가지 않게)
		if (!completed) {
			throw new IllegalStateException("OpenAI 스트림이 완료(response.completed) 없이 종료됨");
		}

		// 저장 텍스트 = 스트리밍으로 내보낸 것과 정확히 같음(화면·재조회 불일치 방지)
		boolean noSource = citations.isEmpty();
		return new ChatCompletion(buffer.toString(), citations, noSource, inputTokens, outputTokens);
	}

	/**
	 * 사용량 필드 하나를 읽음. 없거나 숫자가 아니면 <b>null</b>(FEAT-OPS-001).
	 *
	 * <p>Jackson 의 {@code asInt()} 는 없는 노드에 0 을 주는데, 그러면 "usage 가 안 왔다"와
	 * "정말 0 토큰"이 저장에서 구분되지 않음 - 합계·평균이 조용히 낮아짐.
	 */
	private static Integer intOrNull(JsonNode node, String field) {
		JsonNode v = node.path(field);
		return v.isNumber() ? v.asInt() : null;
	}

	/**
	 * output[]을 훑어 file_search 결과(파일명 → 스니펫)를 모으고, 본문 annotation이 실제 인용한 파일만
	 * 골라 출처로 만듦. 검색은 됐지만 인용되지 않은 파일은 제외함. 각주 번호(seq)는 인용 순서(1-base).
	 */
	private List<CitationData> extractCitations(JsonNode response) {
		Map<String, String> snippetByFile = new HashMap<>();
		Map<String, Boolean> citedFiles = new LinkedHashMap<>(); // 순서 유지 + 중복 제거

		for (JsonNode item : response.path("output")) {
			if ("file_search_call".equals(item.path("type").asString(""))) {
				for (JsonNode r : item.path("results")) {
					String name = r.path("filename").asString("");
					if (!name.isEmpty()) {
						snippetByFile.putIfAbsent(name, r.path("text").asString(""));
					}
				}
			}
			for (JsonNode content : item.path("content")) {
				for (JsonNode ann : content.path("annotations")) {
					if ("file_citation".equals(ann.path("type").asString(""))) {
						String name = ann.path("filename").asString("");
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
			// file_search 인용은 브라우징 가능한 URI가 없음. non-null 유지(ChatService Map.of가 null 불가, mock 파리티).
			// TODO(M2) : annotation의 file_id로 상관(filename 동명이인 방지) + 표시용 식별자 부여
			citations.add(new CitationData(seq++, name, snippet, ""));
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
	 *
	 * <p><b>단, 아래 두 분기는 실행된 적이 없다</b>(#124). 호출자가 항상 {@code (null, [])} 를 넘긴다 -
	 * 근거는 {@link OpenAiService#deleteResources} 의 설명에 있다. <b>여기 적힌 규칙은 「지금 이렇게
	 * 동작한다」가 아니라 「대화별 스토어를 쓰게 되면 이렇게 동작해야 한다」로 읽을 것.</b>
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

	// ── RAG 문서 관리(FEAT-ADMIN-002) ────────────────────────────────────────────

	@Override
	public boolean hasSharedVectorStore() {
		return sharedVectorStoreId != null && !sharedVectorStoreId.isBlank();
	}

	/**
	 * Files 업로드 → 공용 Vector Store 연결. 두 단계이며 <b>뒤 단계가 실패하면 고아 파일이 남으므로</b>
	 * 즉시 삭제를 시도하고, 그것도 실패하면 경고 로그에 file_id 를 남김.
	 *
	 * <p>어느 경우에도 예외를 던짐 - 호출자가 DB 행을 만들지 않아야 함. 스토어에는 없는데 목록에만
	 * 뜨는 상태가 가장 나쁨(화면에 보이는데 검색에는 안 잡히고 지울 수도 없음).
	 */
	@Override
	public UploadedDocument uploadDocument(String filename, byte[] content, String contentType) {
		MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
		form.add("purpose", "assistants");
		form.add("file", new NamedByteArrayResource(content, filename));

		JsonNode uploaded = client.post()
				.uri("/files")
				.contentType(MediaType.MULTIPART_FORM_DATA)
				.body(form)
				.retrieve()
				.body(JsonNode.class);

		// 기본값 null 이 이 가드의 전제다. Jackson 2 는 `"id": null` 에 **문자열 "null"** 을 돌려줘
		// isBlank() 가 false 가 됐고, openai_file_id = "null" 인 행이 만들어져 검색에도 안 잡히고
		// 삭제도 안 되는 문서가 남았다. Jackson 3 은 기본값을 그대로 줘 여기서 걸린다(#63 에서 확인)
		String fileId = uploaded == null ? null : uploaded.path("id").asString(null);
		if (fileId == null || fileId.isBlank()) {
			throw new IllegalStateException("OpenAI 파일 업로드 응답에 id 가 없음");
		}

		try {
			client.post()
					.uri("/vector_stores/" + sharedVectorStoreId + "/files")
					.header("OpenAI-Beta", OPENAI_BETA_ASSISTANTS_V2)
					.contentType(MediaType.APPLICATION_JSON)
					.body(Map.of("file_id", fileId))
					.retrieve()
					.toBodilessEntity();
		} catch (Exception e) {
			// 연결에 실패하면 파일만 덩그러니 남음. 여기서 지우지 않으면 아무도 그 존재를 모름
			deleteQuietly("/files/" + fileId, "file", fileId);
			throw new IllegalStateException("Vector Store 연결 실패 - 업로드한 파일을 정리함", e);
		}
		return new UploadedDocument(fileId, sharedVectorStoreId);
	}

	/**
	 * 인덱싱 상태. 응답의 상태 문자열을 우리 어휘(in_progress · completed · failed)로 좁힘.
	 * <b>모르는 값을 completed 로 넘기지 않음</b> - 검색에 안 잡히는 문서를 "완료"로 보이게 하면
	 * 관리자가 오독함(REQ-ADMIN-003 이 막으려는 상태).
	 */
	@Override
	public String documentStatus(String vectorStoreId, String openaiFileId) {
		try {
			JsonNode node = client.get()
					.uri("/vector_stores/" + vectorStoreId + "/files/" + openaiFileId)
					.header("OpenAI-Beta", OPENAI_BETA_ASSISTANTS_V2)
					.retrieve()
					.body(JsonNode.class);
			String status = node == null ? "" : node.path("status").asString("");
			return switch (status) {
				case "completed" -> "completed";
				case "in_progress" -> "in_progress";
				default -> "failed";
			};
		} catch (Exception e) {
			// 조회 자체가 실패한 것은 "인덱싱 실패"와 **다르다**(#91). 종전에는 failed 를 돌려줬는데,
			// 호출자가 그것을 DB 에 굳히면 그 행이 재조회 대상에서 빠져 다시는 묻지 않게 됨 -
			// 「모르는 동안 failed 가 안전하다」는 판단은 **표시**에 대해서만 맞고, 영속화하는 순간
			// 「모름」이 「확정된 실패」가 됨. 모르면 null 을 돌려주고 판단은 호출자에게 맡김
			log.warn("openai 문서 상태 조회 실패 {}: {}", openaiFileId, e.getMessage());
			return null;
		}
	}

	/** 연결 해제 후 파일 삭제. 둘 다 실패해도 던지지 않음 - 호출자는 삭제 표시를 계속 진행함 */
	@Override
	public void deleteDocument(String vectorStoreId, String openaiFileId) {
		deleteQuietly("/vector_stores/" + vectorStoreId + "/files/" + openaiFileId,
				"vector_store_file", openaiFileId);
		deleteQuietly("/files/" + openaiFileId, "file", openaiFileId);
	}

	/** 멀티파트에 파일명을 실으려면 Resource 가 이름을 알아야 함 - ByteArrayResource 는 기본이 null */
	private static final class NamedByteArrayResource extends ByteArrayResource {
		private final String filename;

		NamedByteArrayResource(byte[] bytes, String filename) {
			super(bytes);
			this.filename = filename;
		}

		@Override
		public String getFilename() {
			return filename;
		}
	}

	private void deleteQuietly(String path, String kind, String id) {
		try {
			// 상대 경로여야 빌더의 baseUrl 이 적용됨 - 절대 URL 을 박으면 app.openai.base-url 이
			// 이 경로에서만 죽어, 스파이크·대체 엔드포인트로 돌려도 삭제만 실 API 로 나감
			var request = client.delete().uri(path);
			// 이 메서드는 /files 삭제와 공유됨 - 베타 헤더는 vector store 쪽에만 붙임
			if (path.startsWith("/vector_stores")) {
				request = request.header("OpenAI-Beta", OPENAI_BETA_ASSISTANTS_V2);
			}
			request.retrieve().toBodilessEntity();
		} catch (Exception e) {
			// 정리 실패는 삭제 흐름을 막지 않음(고아 리소스는 별도 정리)
			log.warn("openai {} 삭제 실패 {}: {}", kind, id, e.getMessage());
		}
	}
}
