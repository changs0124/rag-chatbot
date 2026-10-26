package com.ragchatbot.openai;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.ConnectException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Predicate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.ragchatbot.exception.ApiExceptions.UpstreamUnavailableException;
import com.ragchatbot.storage.FileStorage;

/**
 * 실 OpenAI 연동(APP_MODE=live). RestClient 직접 호출 + Responses API 스트리밍.
 *
 * <p>구조 : Responses API(모델은 `OPENAI_MODEL`) + 공용 Vector Store 기반 file_search + 이미지 비전 입력(base64) +
 * 스트리밍 토큰 → onToken + 응답 annotations(file_citation) → CitationData. 무자료(인용 0건)는
 * 텍스트를 건드리지 않고 {@code noSource} 플래그로만 알림(REQ-RAG-003) - 인용 0건은 스트림이 끝나야 알 수 있어
 * 이미 보낸 토큰 앞에 접두를 붙일 수 없기 때문임.
 *
 * <p><b>실 응답으로 검증됨(REQ-RAG-005, 2026-09-22)</b> : 실키 · 공용 Vector Store 로 스트리밍 · 검색 단계 이벤트 ·
 * 완료 이벤트 · {@code file_citation} 인용 · 결과 스니펫 · 이미지 입력 · 문서 업로드/삭제를 확인함.
 * 가정별 확인 결과는 {@code docs/01_specs/live-integration.md} 3절, 관측 원본은 {@code .issue/184/evidence/}(#184).
 */
@Service
// 판정은 AppModeGuard.normalize 하나로(#248) - Mock 쪽 주석 참고
@ConditionalOnExpression("T(com.ragchatbot.config.AppModeGuard).normalize('${app.mode:}') == 'live'")
public class OpenAiRealService implements OpenAiService {

	private static final Logger log = LoggerFactory.getLogger(OpenAiRealService.class);

	/**
	 * Vector Store 계열 호출에만 싣는 베타 헤더(#37).
	 *
	 * <p><b>왜 붙이는가</b> — 공식 {@code openai-python} 의 {@code resources/vector_stores/} 는
	 * vector_stores 와 그 하위 files 의 <b>모든</b> 메서드에서 이 헤더를 주입하고, 공식 API 레퍼런스의
	 * curl 예시에도 들어 있다.
	 *
	 * <p><b>필수는 아니다</b> — 헤더 없이도 스토어 호출이 200 이고, 실어도 문제가 없다. 그래서 "없으면 막혀서" 가
	 * 아니라 <b>문서화된 계약(SDK · API 레퍼런스)과 맞추려고</b> 남긴다(실측은 #37).
	 *
	 * <p><b>왜 기본 헤더가 아닌가</b> — 기본 헤더로 올리면 {@code /responses} 와 {@code /files} 에도 함께
	 * 나간다. SDK 는 그 둘에 붙이지 않으며, 그 둘에 붙였을 때의 효과는 재 보지 않았다. 근거가 있는 범위에만
	 * 붙인다. 이 경계는 {@code OpenAiRealBetaHeaderTest} 가 양방향으로 잠근다.
	 */
	private static final String OPENAI_BETA_ASSISTANTS_V2 = "assistants=v2";

	/** 업로드가 OpenAI 일시 장애로 실패했을 때 관리자에게 보이는 문구(#476) */
	private static final String UPSTREAM_RETRY_MESSAGE = "OpenAI 가 일시적으로 응답하지 않음 - 잠시 뒤 다시 시도해 주세요";

	/**
	 * DELETE 의 시도 횟수와 간격(#476). 10-26 운영에서 OpenAI 503 이 한 번씩 나 파일이 남았다. DELETE 는 몇 번 보내도
	 * 결과가 같고 404 도 성공으로 치므로 다시 보내도 안전하다. 간격은 시도마다 늘린다(300 · 600ms) - 관리자 요청이 기다린다
	 */
	private static final int DELETE_ATTEMPTS = 3;
	private static final long DELETE_RETRY_BACKOFF_MS = 300;

	/** 스트리밍({@code /responses}) 전용. 읽기 타임아웃이 길다 */
	private final RestClient streamClient;
	/** 그 밖의 모든 호출(문서 업로드·상태·삭제). 읽기 타임아웃이 짧다 */
	private final RestClient client;
	private final ObjectMapper mapper = new ObjectMapper();
	private final FileStorage fileStorage;
	private final String model;
	private final String sharedVectorStoreId;

	/**
	 * 검색 도구가 붙은 턴에 함께 보내는 지시(#39). 줄마다 실측한 전후 수치는
	 * {@code docs/01_specs/live-integration.md} 3-2 「지시문 줄별 실측」 표에 있다. 줄을 바꾸면 그 표의 수치가 무효다.
	 *
	 * <p><b>왜 필요한가</b> — {@code tool_choice} 를 주지 않으면 기본값이 {@code auto} 라 file_search 호출
	 * 여부가 모델 재량이다. 모델이 검색을 건너뛰면 annotation 이 0건이 되고 {@code noSource = citations.isEmpty()} 가
	 * true 가 되어, 스토어에 분명히 있는 내용을 물어도 화면에 「자료 없음」이 뜰 수 있다.
	 *
	 * <p><b>왜 강제하지 않는가</b> — 강제하면 근거 부착률은 오르지만 단순 인사말에도 검색이 붙어 턴당 비용과
	 * 응답 지연이 는다. 유도하되 강제하지 않는 쪽을 골랐고 편차는 아는 대가다(판단은 live-integration.md 3-2).
	 *
	 * <p>줄별로 막는 것 :
	 * <ul>
	 * <li>#181 못 찾았으면 인용하지 않는다 - 판정이 {@code citations.isEmpty()} 하나라 부재 설명 문장에 인용이 1건만
	 *     붙어도 「자료 없음」이 사라지고, 본문과 화면이 반대로 말한다</li>
	 * <li>#372 인용 표기는 문장 끝에만 - 문서 이름 자리에 넣으면 {@link CitationMarkupFilter} 가 지운 뒤 문장이 깨지고,
	 *     필터는 스트림 조각 단위라 이미 나간 공백을 되돌릴 수 없다. 지시로도 남는 경우는 필터가 그 자리에 문서 이름을
	 *     넣는다(#429)</li>
	 * <li>#376 무자료 일반 설명에서 절차를 단계로 쓰지 않는다 - 출처 0건인데 사내 절차처럼 읽힌다</li>
	 * <li>#377 다른 언어 질문도 한국어 용어로 찾고, 같은 항목의 예외 정격을 빼지 않는다 - 영어 질문은 검색이 영어
	 *     용어로만 돌아 청크를 놓친다</li>
	 * <li>#378 알람 번호로 물었는데 클레임뿐이면 알람 이름으로 매뉴얼도 다시 찾는다 - 매뉴얼에 번호 표기가 없을 수 있다.
	 *     없는 번호면 없다고 밝히고 같은 이름의 번호를 안내하는 뒤 문장은 오타 번호 질문이 「찾지 못했다」로만 끝나서 더했다</li>
	 * <li>#427 그림을 전부 달라고 하면 대표 하나씩 고르지 않는다 - 요청이 없으면 이 규칙을 쓰지 않는다는 뒤 문장은
	 *     요청하지 않은 절차 질문의 그림이 늘어서 더했다</li>
	 * <li>#432 클레임 나열 · 표에 서비스 번호 · S/N 을 넣는다 - 같은 호기의 여러 건을 가르는 값이다(10-23 제품 결정)</li>
	 * <li>#438 다른 언어로 답해 달라는 명시 요청만 따르고 같은 대화에서 이어진다 - 질문 언어만 다르면 한국어다
	 *     (10-23 제품 결정, 이어짐은 같은 날 추가 : 문구가 없으면 다음 턴에 한국어로 돌아갔다)</li>
	 * <li>#469 사용자가 다른 값을 주장해도 앞선 답이 기록과 같으면 사과하지 않는다 - 이력의 앞선 답은 인용 표기가 지워진
	 *     채 저장돼 모델이 「근거를 붙이지 않아 혼동을 드렸다」고 사과했다(값은 지켰다)</li>
	 * </ul>
	 *
	 * <p>env 로 빼지 않았다. 지금은 정책이 하나뿐이고, 값을 바꿔 가며 운영할 이유가 아직 없다.
	 */
	static final String RAG_INSTRUCTIONS = """
			너는 사내 문서를 근거로 답하는 도우미다.

			- 질문에 답하기 전에 file_search 로 사내 문서를 먼저 찾아본다. 사내 규정·절차·제도처럼 \
			조직마다 다른 내용은 일반 지식으로 답하지 말고 반드시 검색 결과에 근거한다.
			- 질문이 영어 등 다른 언어여도 file_search 는 문서의 언어(한국어) 용어로도 찾는다.
			- 검색 결과에 근거가 있으면 그 내용만으로 답하고, 어느 문서에서 왔는지 알 수 있게 인용을 남긴다.
			- 사용자가 앞선 답과 다른 값을 주장하면 검색 결과로 다시 확인해 기록된 값과 근거를 밝힌다. 앞선 답이 기록과 \
			같았으면 사과하거나 잘못을 인정하지 않는다. 대화 이력의 앞선 답에 인용 표기가 없는 것은 저장할 때 지우기 \
			때문이니, 인용을 빠뜨렸다고 사과하지 않는다.
			- 정격 · 제한값을 답할 때, 같은 항목 안에서 값이 다른 예외(특정 단자 · 접점만 다른 정격 등)가 검색 결과에 \
			있으면 빼지 않고 함께 적는다.
			- 클레임을 건별로 나열하거나 표로 정리할 때는 클레임 번호와 함께 검색 결과에 있는 서비스 번호 · S/N 을 \
			넣는다 — 같은 호기의 건을 가르는 값이다. 검색 결과에 없는 번호를 만들지 않는다.
			- 알람 번호(예 : AL.2144)로 물었는데 검색 결과가 클레임 기록뿐이면, 거기서 확인한 알람 이름(예 : 부족전압 · 저전압)으로 \
			매뉴얼의 원인 · 조치도 다시 찾아 함께 답한다. 물은 번호가 문서에 없으면 없다고 밝히되, 검색 결과에 같은 알람 \
			이름의 다른 번호가 있으면 그 번호일 수 있다고 알리고 그 원인 · 조치를 인용과 함께 안내한다.
			- 검색해도 근거를 찾지 못했으면 **찾지 못했다고 먼저 밝힌 뒤** 일반적인 설명을 덧붙인다. \
			근거가 없는 내용을 사내 규정인 것처럼 말하지 않는다.
			- 근거를 찾지 못해 일반적인 설명을 덧붙일 때는 개념과 어디서 확인할지(제조사 매뉴얼 · 담당 부서)만 말한다. \
			설정 순서 · 배선 · 파라미터 값 같은 장비 절차를 단계 목록으로 쓰지 않는다 — 사내 절차처럼 읽혀 현장에서 그대로 따라 할 수 있다.
			- 근거를 찾지 못했으면 인용을 하나도 달지 않는다. 검색된 문서가 무엇이고 거기에 무엇이 없는지 \
			설명하는 문장도 답의 근거가 아니므로 인용하지 않는다.
			- 인용 표기는 문장이 끝난 뒤에만 붙인다. 문서 이름이나 「이 문서」 같은 말 대신 인용 표기를 \
			문장 안에 넣지 않는다 — 화면은 표기를 지우므로 그 자리가 빈칸이 된다. 어느 문서인지 말해야 하면 글자로 적는다.
			- 검색 결과에 `[[그림:키]]` 형태의 그림 표식이 있고 그 그림이 답에 도움이 되면, 그 표식을 \
			**글자 하나 바꾸지 말고** 따로 한 줄에 옮겨 적는다. 화면이 그 줄을 그림으로 바꿔 보여 준다. \
			사용자가 그림을 전부 · 모두 · 빠짐없이 보여 달라고 하면, 물은 절차 · 항목에 해당하는 검색 결과의 표식을 \
			단계마다 하나씩 고르지 말고 모두 옮긴다. 두 가지 이상을 함께 물었으면 각각에 대해 그렇게 한다. \
			그림을 전부 달라는 말이 없으면 이 규칙을 쓰지 않고, 답에 도움이 되는 그림만 옮긴다. \
			검색 결과에 없는 표식을 만들지 않고, 그림을 글자나 기호로 흉내 내어 그리지 않는다.
			- 한국어로 답한다. 사용자가 다른 언어로 답해 달라고 명시적으로 요청하면(예 : answer in English) 그 언어로 답한다. \
			그 요청은 같은 대화에서 사용자가 다른 언어를 다시 요청할 때까지 이어진다. \
			질문이 다른 언어로 쓰였다는 것만으로는 요청이 아니므로 한국어로 답한다. 어느 언어로 답하든 문서 이름 · 알람 번호 · \
			파라미터 번호 · S/N 같은 표기는 원문 그대로 둔다.
			""";

	public OpenAiRealService(
			@Value("${app.openai.api-key}") String apiKey,
			@Value("${app.openai.model}") String model,
			@Value("${app.openai.vector-store-id}") String vectorStoreId,
			@Value("${app.openai.base-url}") String baseUrl,
			@Value("${app.openai.stream-read-timeout-ms}") long streamReadTimeoutMs,
			@Value("${app.openai.request-timeout-ms}") long requestTimeoutMs,
			@Value("${app.chat.sse-timeout-ms}") long sseTimeoutMs,
			FileStorage fileStorage) {
		// live 모드인데 키가 비면 부팅 즉시 실패(per-request 401 대신 fail-fast). 이 빈은 app.mode=live에서만 로드됨
		if (apiKey == null || apiKey.isBlank()) {
			throw new IllegalStateException(
					"APP_MODE=live 인데 OPENAI_API_KEY 가 비어 있음. 실 연동 키를 env로 주입할 것");
		}
		// **워커가 emitter 보다 오래 살면 안 됨**(#76·#92). 부등식이 깨지면 emitter 가 타임아웃으로
		// 죽은 뒤에도 워커가 읽기에 붙어 있어, 그동안 스레드와 동시 스트림 권한이 함께 잡힌다 -
		// 화면에는 아무 스트림도 없는데 "이미 응답을 받는 중" 429 를 받는다. 같은 값이어도 밀리초 경합이라 안 된다
		if (streamReadTimeoutMs >= sseTimeoutMs) {
			throw new IllegalStateException(
					"app.openai.stream-read-timeout-ms(" + streamReadTimeoutMs + ") 는 "
							+ "app.chat.sse-timeout-ms(" + sseTimeoutMs + ") 보다 작아야 함 - "
							+ "크면 SSE 스트림이 끝난 뒤에도 워커가 자원을 붙잡는다");
		}
		this.model = model;
		this.sharedVectorStoreId = vectorStoreId;
		this.fileStorage = fileStorage;
		// **클라이언트를 둘로 나눈다**(#92) - 스트리밍용 긴 읽기 타임아웃은 스트리밍으로만 정당화되고,
		// 문서 조회 · 업로드 · 삭제에 걸리면 그만큼 톰캣 스레드를 잡는다
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
				// 하려는 것임(OpenAiRealStreamingSpikeTest) - 캔드 InputStream 으로는 RestClient 가 응답을 통째로
				// 버퍼링하는지 아닌지가 드러나지 않음
				.baseUrl(baseUrl)
				.defaultHeader("Authorization", "Bearer " + apiKey)
				.build();
	}

	/** 라이브 단계 라벨(REQ-CHAT-005). 목업과 달리 실제 file_search 결과에 근거하므로 실 문구를 씀 */
	private static final Map<Stage, String> STAGE_LABELS = Map.of(
			Stage.ANALYZING, "질문 분석 중",
			Stage.SEARCHING, "참조 문서 검색 중",
			Stage.REVIEWING, "참조 문서 확인 중",
			Stage.GENERATING, "답변 작성 중");

	/**
	 * 검색 단계는 file_search 호출이 <b>시작됐다는</b> 이벤트에 올리므로 그 시점에는 어느 문서가 걸렸는지 아직 모름 -
	 * 들어온 이름이 있어도 붙이지 않음(REQ-RAG-004). 이름은 결과가 도착한 뒤의 확인 단계에만 실림(#375)
	 */
	@Override
	public String stageLabel(Stage stage, List<String> sources, boolean withImage) {
		if (stage == Stage.ANALYZING && withImage) {
			return "질문·첨부 이미지 분석 중";
		}
		if (stage == Stage.REVIEWING && !sources.isEmpty()) {
			return STAGE_LABELS.get(stage) + " · " + OpenAiService.sourceSummary(sources);
		}
		return STAGE_LABELS.get(stage);
	}

	@Override
	public ChatCompletion streamChat(ChatInput input, Consumer<String> onToken, BiConsumer<Stage, List<String>> onStage) {
		Map<String, Object> body = new HashMap<>();
		body.put("model", model);
		body.put("input", buildInput(input));
		body.put("stream", true);
		// 공용 Store 미설정이면 file_search 없이 일반 응답(출처 빈 리스트 → noSource=true)
		if (hasSharedVectorStore()) {
			body.put("tools", List.of(Map.of(
					"type", "file_search",
					"vector_store_ids", List.of(sharedVectorStoreId))));
			// 스니펫 노출을 위해 검색 결과 본문까지 받음
			body.put("include", List.of("file_search_call.results"));
			// 검색 도구가 붙을 때만 지시를 싣는다 - 스토어가 없으면 근거를 찾으라는 말이 거짓이 된다
			body.put("instructions", RAG_INSTRUCTIONS);
		}

		return streamClient.post()
				// 상대 경로여야 빌더의 baseUrl 이 적용됨 - 절대 URI 면 app.openai.base-url 이 무시된다
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
		String text = input.userMessage();
		List<AttachmentRef> images = input.attachments();
		List<Turn> history = input.history();

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
			return "data:" + img.mimeType() + ";base64,"
					+ Base64.getEncoder().encodeToString(bytes);
		} catch (Exception e) {
			throw new IllegalStateException("첨부 이미지를 읽지 못함: " + img.storagePath(), e);
		}
	}

	/**
	 * Responses API SSE를 읽어 토큰을 흘리고, 완료 이벤트에서 출처를 추출함.
	 * 진행 단계(REQ-CHAT-005)는 실제 도착한 이벤트에만 근거함 - file_search 이벤트가 없으면 검색 단계도 없음(REQ-RAG-004).
	 */
	// 패키지 가시성 : 캔드 스트림으로 단계 매핑을 단위 테스트함(실 호출 없이 검증)
	ChatCompletion consumeStream(InputStream in, Consumer<String> onToken, BiConsumer<Stage, List<String>> onStage) {
		StringBuilder buffer = new StringBuilder();
		List<CitationData> citations = List.of();
		// 사용량은 완료 이벤트에서만 옴. 못 받으면 null 로 남겨 "모르는 것"을 0 과 구분함(FEAT-OPS-001)
		Integer inputTokens = null;
		Integer outputTokens = null;
		boolean completed = false;
		boolean searchingSent = false;
		boolean generatingSent = false;
		// 확인 단계에 실은 자료명 - 검색이 여러 번 돌면 이름을 모아 새 이름이 생길 때만 다시 올림
		Set<String> reviewedSources = new LinkedHashSet<>();
		CitationMarkupFilter markup = new CitationMarkupFilter();
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
				// **기본값을 반드시 준다** - Jackson 3 의 인자 없는 접근자는 Object·Array 노드에서 예외를 던져,
				// 모르는 모양의 이벤트 하나가 스트림 전체를 죽인다. 업스트림 스키마가 넓어져도 조용히 넘어가는 쪽이 맞다(#63)
				String type = ev.path("type").asString("");
				if ("response.output_text.delta".equals(type)) {
					// 인용 표기 원문은 화면·저장본 어디에도 남기지 않음(#277)
					String delta = markup.accept(ev.path("delta").asString(""));
					if (delta.isEmpty()) {
						continue;
					}
					if (!generatingSent) {
						onStage.accept(Stage.GENERATING, List.of()); // 첫 토큰 직전이 생성 경계임
						generatingSent = true;
					}
					buffer.append(delta);
					onToken.accept(delta);
				} else if (!searchingSent && ("response.file_search_call.in_progress".equals(type)
						|| "response.file_search_call.searching".equals(type))) {
					// 실제 file_search 호출이 시작된 근거가 있을 때만 검색 단계를 보냄.
					// 이 시점에는 어느 문서가 걸렸는지 아직 모르므로 자료명은 비워 보냄(stageLabel 주석 참고)
					onStage.accept(Stage.SEARCHING, List.of());
					searchingSent = true;
				} else if ("response.output_item.done".equals(type)
						&& "file_search_call".equals(ev.path("item").path("type").asString(""))) {
					// 검색 결과가 실제로 도착한 경계(#375). include: file_search_call.results 로 결과가 실려 옴.
					// 이름은 출처와 같은 규칙(resultFilename)으로 뽑음 - 진행 문구와 출처 목록이 어긋나지 않게 함
					boolean added = false;
					List<String> names = new ArrayList<>();
					for (JsonNode r : ev.path("item").path("results")) {
						String name = resultFilename(r);
						names.add(name);
						if (!name.isEmpty()) {
							added |= reviewedSources.add(name);
						}
					}
					markup.addSearch(names); // 명사 자리 표기를 문서 이름으로 바꿀 때 씀(#429)
					// 0건이면 확인할 문서가 없으므로 단계를 만들지 않음(REQ-RAG-004)
					if (added) {
						onStage.accept(Stage.REVIEWING, List.copyOf(reviewedSources));
					}
				} else if ("response.completed".equals(type)) {
					String rest = markup.flush(); // 마지막 표기 뒤에 보류해 둔 공백
					if (!rest.isEmpty()) {
						if (!generatingSent) {
							onStage.accept(Stage.GENERATING, List.of());
							generatingSent = true;
						}
						buffer.append(rest);
						onToken.accept(rest);
					}
					JsonNode response = ev.path("response");
					citations = extractCitations(response, markup.fileRefs(), buffer.toString());
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
	 *
	 * <p>annotation 이 0건이면 본문 인용 표기의 {@code turnNfileM} 으로 복원함(#281). gpt-6-sol 은 근거 답에도
	 * annotation 을 빠뜨릴 때가 있어, 그대로 두면 「자료 없음」이 본문과 반대로 뜸. 대응 규칙(N번째
	 * file_search_call 의 results[M], 둘 다 0-base)은 2026-10-15 실측(live-integration.md 3-1). 범위 밖 참조는 버림.
	 *
	 * <p>스니펫은 그 파일의 검색 결과 중 답이 실제로 쓴 청크를 고름({@link SnippetPicker#pickSnippet}, #268).
	 */
	private List<CitationData> extractCitations(JsonNode response, List<CitationMarkupFilter.FileRef> markupRefs,
			String answer) {
		Map<String, List<String>> chunksByFile = new HashMap<>(); // 파일별 결과 본문, 검색 순서 유지
		Set<String> citedFiles = new LinkedHashSet<>(); // 순서 유지 + 중복 제거
		List<List<String>> filesBySearch = new ArrayList<>(); // file_search_call 순서별 결과 파일명

		for (JsonNode item : response.path("output")) {
			if ("file_search_call".equals(item.path("type").asString(""))) {
				List<String> files = new ArrayList<>();
				for (JsonNode r : item.path("results")) {
					String name = resultFilename(r);
					files.add(name);
					if (!name.isEmpty()) {
						chunksByFile.computeIfAbsent(name, k -> new ArrayList<>()).add(r.path("text").asString(""));
					}
				}
				filesBySearch.add(files);
			}
			for (JsonNode content : item.path("content")) {
				for (JsonNode ann : content.path("annotations")) {
					if ("file_citation".equals(ann.path("type").asString(""))) {
						String name = ann.path("filename").asString("");
						if (!name.isEmpty()) {
							citedFiles.add(name);
						}
					}
				}
			}
		}

		if (citedFiles.isEmpty()) {
			for (CitationMarkupFilter.FileRef ref : markupRefs) {
				if (ref.turn() < filesBySearch.size() && ref.file() < filesBySearch.get(ref.turn()).size()) {
					String name = filesBySearch.get(ref.turn()).get(ref.file());
					if (!name.isEmpty()) {
						citedFiles.add(name);
					}
				}
			}
		}

		List<CitationData> citations = new ArrayList<>();
		int seq = 1;
		for (String name : citedFiles) {
			String snippet = SnippetPicker.truncate(
					SnippetPicker.pickSnippet(chunksByFile.getOrDefault(name, List.of()), answer));
			// 인용은 파일명으로 묶는다 - 이름이 같은 문서가 둘이면 한 출처로 합쳐진다(annotation 의 file_id 로 묶으면 피할 수 있다)
			citations.add(new CitationData(seq++, name, snippet));
		}
		return citations;
	}

	/** 검색 결과 하나의 자료명. 출처(CitationData.sourceName)와 확인 단계 라벨이 같은 값을 쓰도록 한 곳에 둠(#375) */
	private static String resultFilename(JsonNode result) {
		return result.path("filename").asString("");
	}

	// ── RAG 문서 관리(FEAT-ADMIN-002) ────────────────────────────────────────────

	@Override
	public boolean hasSharedVectorStore() {
		return sharedVectorStoreId != null && !sharedVectorStoreId.isBlank();
	}

	/**
	 * Files 업로드 → 공용 Vector Store 연결. 두 단계이며 <b>뒤 단계가 실패하면 고아 파일이 남으므로</b>
	 * 즉시 삭제를 시도하고, 그것도 실패하면 ERROR 로그에 file_id 를 남김(#476). OpenAI 일시 장애(5xx · 연결 실패)는 503 으로 알릴 예외로 바꿈.
	 *
	 * <p>어느 경우에도 예외를 던짐 - 호출자가 DB 행을 만들지 않아야 함. 스토어에는 없는데 목록에만
	 * 뜨는 상태가 가장 나쁨(화면에 보이는데 검색에는 안 잡히고 지울 수도 없음).
	 */
	@Override
	public UploadedDocument uploadDocument(String filename, byte[] content) {
		MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
		form.add("purpose", "assistants");
		form.add("file", new NamedByteArrayResource(content, filename));

		JsonNode uploaded;
		try {
			uploaded = client.post()
					.uri("/files")
					.contentType(MediaType.MULTIPART_FORM_DATA)
					.body(form)
					.retrieve()
					.body(JsonNode.class);
		} catch (RuntimeException e) {
			// 관리자가 다시 시도하면 되는 일시 장애다(#476). **POST 는 여기서 다시 보내지 않는다** - OpenAI 가 실제로는
			// 받아 처리했다면 같은 파일이 둘 생기고, 그중 하나는 아무도 모르는 고아가 된다.
			// 읽기 타임아웃은 일시 장애로 치지 않는다 - 파일이 만들어졌는지 모르는데 「다시 시도」를 권하면 중복을 부른다
			if (isTransient(e)) {
				throw new UpstreamUnavailableException(UPSTREAM_RETRY_MESSAGE, e);
			}
			throw e;
		}

		// 기본값 null 이 이 가드의 전제다 - `"id": null` 이 문자열 "null" 로 읽히면 가드를 지나
		// openai_file_id = "null" 인 행이 생긴다. Jackson 3 은 기본값을 그대로 줘 여기서 걸린다(#63)
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
			deleteFileOrReport(fileId);
			if (isTransient(e)) {
				throw new UpstreamUnavailableException(UPSTREAM_RETRY_MESSAGE, e);
			}
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
			return narrowStatus(node == null ? "" : node.path("status").asString(""));
		} catch (Exception e) {
			// 조회 자체가 실패한 것은 "인덱싱 실패"와 **다르다**(#91) - failed 를 돌려주면 호출자가 DB 에
			// 굳혀 재조회 대상에서 빠진다. 모르면 null 을 돌려주고 판단은 호출자에게 맡김
			log.warn("openai 문서 상태 조회 실패 {}: {}", openaiFileId, e.getMessage());
			return null;
		}
	}

	/** 스토어 파일 상태를 우리 어휘로 좁힘. 모르는 값(cancelled 등)은 completed 로 넘기지 않음 */
	private static String narrowStatus(String status) {
		return switch (status) {
			case "completed" -> "completed";
			case "in_progress" -> "in_progress";
			default -> "failed";
		};
	}

	/**
	 * 공용 스토어 파일 전부(#193). 스토어 파일 목록은 페이지(최대 100개)로 오므로 {@code has_more} 가
	 * 거짓이 될 때까지 {@code after} 로 이어 읽는다. 파일명·크기는 스토어 응답에 없어 {@code /files/{id}} 로 묻는다.
	 *
	 * <p>예외를 삼키지 않는다 - 일부만 돌려주면 동기화가 그것을 전부로 읽는다.
	 */
	@Override
	public List<StoreFile> listStoreFiles(Predicate<String> needsDetail) {
		List<StoreFile> files = new ArrayList<>();
		String after = null;
		while (true) {
			String uri = "/vector_stores/" + sharedVectorStoreId + "/files?limit=100"
					+ (after == null ? "" : "&after=" + after);
			JsonNode page = client.get()
					.uri(uri)
					.header("OpenAI-Beta", OPENAI_BETA_ASSISTANTS_V2)
					.retrieve()
					.body(JsonNode.class);
			if (page == null) {
				throw new IllegalStateException("OpenAI 스토어 파일 목록 응답이 비어 있음");
			}
			for (JsonNode item : page.path("data")) {
				String fileId = item.path("id").asString(null);
				if (fileId == null || fileId.isBlank()) {
					throw new IllegalStateException("OpenAI 스토어 파일 목록에 id 가 없는 항목이 있음");
				}
				String status = narrowStatus(item.path("status").asString(""));
				if (!needsDetail.test(fileId)) {
					files.add(new StoreFile(fileId, sharedVectorStoreId, null, 0, status));
					continue;
				}
				JsonNode file;
				try {
					file = client.get().uri("/files/" + fileId).retrieve().body(JsonNode.class);
				} catch (HttpClientErrorException.NotFound e) {
					// File 은 지워졌는데 스토어 연결만 남았다(#271) - 검색에는 잡히므로 숨기지 말고 알린다.
					// 던지면 고아 하나가 동기화 전체를 멈춰 그것을 정리할 길도 막힌다. 404 가 아닌 실패는 아래처럼 던진다
					files.add(new StoreFile(fileId, sharedVectorStoreId, null, 0, StoreFile.MISSING));
					continue;
				}
				String filename = file == null ? null : file.path("filename").asString(null);
				if (filename == null || filename.isBlank()) {
					throw new IllegalStateException("OpenAI 파일 응답에 파일명이 없음: " + fileId);
				}
				files.add(new StoreFile(fileId, sharedVectorStoreId, filename, file.path("bytes").asLong(0), status));
			}
			if (!page.path("has_more").asBoolean(false)) {
				return files;
			}
			after = page.path("last_id").asString(null);
			if (after == null || after.isBlank()) {
				// 다음 페이지가 있다는데 이어 읽을 기준이 없음 - 여기서 멈추면 일부만 돌려주게 된다
				throw new IllegalStateException("OpenAI 스토어 파일 목록에 has_more 인데 last_id 가 없음");
			}
		}
	}

	/**
	 * 연결 해제 후 파일 삭제. 둘 다 실패해도 던지지 않음 - 호출자는 삭제 표시를 계속 진행함.
	 *
	 * <p><b>연결 해제가 실패하면 File 을 지우지 않는다</b>(#271) - 이유와 복구 경로는 {@link OpenAiService#deleteDocument}.
	 */
	@Override
	public void deleteDocument(String vectorStoreId, String openaiFileId) {
		boolean detached = deleteQuietly("/vector_stores/" + vectorStoreId + "/files/" + openaiFileId,
				"vector_store_file", openaiFileId);
		if (!detached) {
			log.warn("스토어 연결 해제 실패로 file {} 은 지우지 않음 - 동기화하면 목록에 다시 보여 다시 지울 수 있음", openaiFileId);
			return;
		}
		deleteFileOrReport(openaiFileId);
	}

	/**
	 * 스토어 밖 File 삭제. 재시도 뒤에도 실패하면 ERROR 로 남긴다(#476) - 그 File 은 스토어에 없어 동기화로도 다시
	 * 보이지 않으므로 <b>이 로그가 유일한 단서</b>다. 남은 File 은 검색에 잡히지 않고 계정 저장 용량만 차지한다
	 */
	private void deleteFileOrReport(String fileId) {
		if (!deleteQuietly("/files/" + fileId, "file", fileId)) {
			log.error("OpenAI 파일 {} 을 지우지 못해 스토어 밖 고아로 남음 - 동기화로도 보이지 않으니 OpenAI 에서 직접 지울 것"
					+ " (DELETE /v1/files/{})", fileId, fileId);
		}
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

	/**
	 * 지워졌거나 이미 없으면(404) 참. 그 밖의 실패는 경고만 남기고 거짓 - 정리 실패는 삭제 흐름을 막지 않음.
	 *
	 * <p>일시 장애(5xx · 연결 거절)만 {@link #DELETE_ATTEMPTS} 번까지 다시 보낸다(#476). <b>읽기 타임아웃은 다시 보내지
	 * 않는다</b> - 한 번에 요청 타임아웃만큼 걸려, 되풀이하면 관리자 요청이 그 몇 배로 묶인다
	 */
	private boolean deleteQuietly(String path, String kind, String id) {
		for (int attempt = 1;; attempt++) {
			try {
				var request = client.delete().uri(path)
						// **본문이 없어도 JSON 을 명시한다**(#271). JDK HttpURLConnection 은 DELETE 에 출력 스트림을 열면서
						// 기본 Content-Type(application/x-www-form-urlencoded)을 붙이는데, 스토어 연결 해제는 그것을
						// 400 unsupported_content_type 으로 거절한다
						.header("Content-Type", MediaType.APPLICATION_JSON_VALUE);
				// 이 메서드는 /files 삭제와 공유됨 - 베타 헤더는 vector store 쪽에만 붙임
				if (path.startsWith("/vector_stores")) {
					request = request.header("OpenAI-Beta", OPENAI_BETA_ASSISTANTS_V2);
				}
				request.retrieve().toBodilessEntity();
				return true;
			} catch (HttpClientErrorException.NotFound e) {
				// 이미 없음 - 지우려던 상태와 같다
				return true;
			} catch (Exception e) {
				if (!isTransient(e) || attempt >= DELETE_ATTEMPTS) {
					log.warn("openai {} 삭제 실패 {} ({}회 시도): {}", kind, id, attempt, e.getMessage());
					return false;
				}
				log.warn("openai {} 삭제 일시 실패 {} - 다시 시도함: {}", kind, id, e.getMessage());
				try {
					Thread.sleep(DELETE_RETRY_BACKOFF_MS * attempt);
				} catch (InterruptedException ie) {
					Thread.currentThread().interrupt();
					log.warn("openai {} 삭제 재시도가 인터럽트로 중단됨 {}", kind, id);
					return false;
				}
			}
		}
	}

	/**
	 * 요청이 OpenAI 에서 처리되지 않았다고 볼 수 있는 일시 장애 - 5xx 또는 연결 자체가 안 됨(#476).
	 * <b>읽기 타임아웃은 넣지 않는다</b> - 요청은 닿았고 처리됐는지 모른다
	 */
	private static boolean isTransient(Exception e) {
		return e instanceof HttpServerErrorException
				|| (e instanceof ResourceAccessException && e.getCause() instanceof ConnectException);
	}
}
