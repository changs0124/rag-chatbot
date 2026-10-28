package com.ragchatbot.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.ragchatbot.openai.OpenAiService;

/** SSE 본문을 읽고 스트림을 여는 테스트 공용 도우미 - 테스트 클래스끼리 서로 기대지 않게 여기에 둔다(#329) */
public final class SseTestSupport {

	private SseTestSupport() {
	}

	/** SSE 본문에서 이벤트 이름을 등장 순서대로 뽑음 */
	public static List<String> eventNames(String sse) {
		List<String> names = new ArrayList<>();
		for (String line : sse.split("\n")) {
			if (line.startsWith("event:")) {
				names.add(line.substring(6).trim());
			}
		}
		return names;
	}

	/** 목 {@link OpenAiService} 의 단계 라벨을 채운다 - 목은 null 을 돌려주는데 단계 이벤트가 Map.of 로 라벨을 실어 NPE 가 난다 */
	public static void stubStageLabel(OpenAiService openAi) {
		when(openAi.stageLabel(any(), any(), anyBoolean())).thenReturn("단계");
	}

	/** 실 톰캣에 원시 HTTP 로 /api/chat 을 열고 SSE 본문을 문자열로 읽는다 - TestRestTemplate 의 변환을 거치지 않는다 */
	public static String rawChat(TestRestTemplate rest, String token, String convId) throws Exception {
		var req = HttpRequest.newBuilder(URI.create(rest.getRootUri() + "/api/chat"))
				.timeout(Duration.ofSeconds(10))
				.header("Authorization", "Bearer " + token)
				.header("Content-Type", "application/json")
				.header("Accept", "text/event-stream")
				.POST(HttpRequest.BodyPublishers.ofString(
						"{\"conversationId\":\"" + convId + "\",\"message\":\"안녕\"}"))
				.build();
		var res = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
		assertThat(res.statusCode()).isEqualTo(200);
		return res.body();
	}

	/** SSE Accept 헤더를 얹는다 */
	public static HttpHeaders sse(HttpHeaders h) {
		h.setAccept(List.of(MediaType.TEXT_EVENT_STREAM));
		return h;
	}

	/** 상태 코드 · JSON 본문 · 오류 코드를 한 번에 확인한다 */
	public static void assertJsonError(ResponseEntity<String> res, HttpStatus status, String code) {
		assertThat(res.getStatusCode()).isEqualTo(status);
		assertThat(res.getHeaders().getContentType()).isNotNull();
		assertThat(res.getHeaders().getContentType().isCompatibleWith(MediaType.APPLICATION_JSON)).isTrue();
		assertThat(res.getBody()).contains("\"code\":\"" + code + "\"");
	}
}
