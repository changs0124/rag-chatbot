package com.ragchatbot.openai;

import java.util.List;
import java.util.function.Consumer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * 실 OpenAI 연동(APP_MODE=live). RestClient 직접 호출(1단계 채택).
 *
 * <p>골격만 존재함 - 실제 요청/응답 매핑(Responses API + Vector Store file_search + 스트리밍 + 비전 +
 * annotations→citations)은 <b>실 API KEY 확보 후 M2 스파이크로 확정</b>함(미결 표). 실 응답 스키마와
 * 무자료 판정 임계를 실물로 확인하기 전에는 완성으로 위장하지 않음(S-1).
 */
@Service
@ConditionalOnProperty(prefix = "app", name = "mode", havingValue = "live")
public class OpenAiRealService implements OpenAiService {

	private final RestClient restClient;

	public OpenAiRealService(@Value("${OPENAI_API_KEY:}") String apiKey) {
		this.restClient = RestClient.builder()
				.baseUrl("https://api.openai.com/v1")
				.defaultHeader("Authorization", "Bearer " + apiKey)
				.build();
	}

	@Override
	public ChatCompletion streamChat(ChatInput input, Consumer<String> onToken) {
		throw new UnsupportedOperationException(
				"실 OpenAI 연동 미구현 - M2 스파이크(실 API KEY 확보 시) 후 완성. 현재는 APP_MODE=mock 사용");
	}

	@Override
	public void deleteResources(String vectorStoreId, List<String> openaiFileIds) {
		throw new UnsupportedOperationException("실 OpenAI 정리 미구현 - M2 스파이크 후 완성");
	}
}
