package com.ragchatbot.openai;

/**
 * 테스트용 {@link OpenAiRealService} 생성을 한 곳에 모은다.
 *
 * <p>위치 인자 8개를 테스트마다 풀어 쓰면 생성자 인자 하나를 늘릴 때 십수 곳을 고쳐야 한다(#329).
 * 타임아웃은 운영 기본값과 같은 비율(스트림 읽기 &lt; SSE)로 둔다 - 생성자가 그 순서를 검사한다.
 */
final class OpenAiRealTestSupport {

	private static final long STREAM_READ_MS = 540_000;
	private static final long REQUEST_MS = 30_000;
	private static final long SSE_MS = 600_000;

	/** 닿지 않는 주소 - 네트워크 없이 파서·매핑만 보는 테스트가 실수로 호출해도 바로 실패한다 */
	private static final String UNREACHABLE = "http://localhost:1";

	private OpenAiRealTestSupport() {
	}

	/** 스트림 파서·매핑만 보는 테스트용. 공용 스토어 없음 */
	static OpenAiRealService parserOnly() {
		return against(UNREACHABLE, "");
	}

	/** 가짜 서버 등 {@code baseUrl} 로 실제 요청을 보내는 테스트용 */
	static OpenAiRealService against(String baseUrl, String storeId) {
		return create(baseUrl, storeId, STREAM_READ_MS, REQUEST_MS, SSE_MS);
	}

	/** 읽기 타임아웃 경로를 보는 테스트용 - 기본 30초를 기다리지 않게 짧게 줄인다(#476) */
	static OpenAiRealService againstWithRequestTimeout(String baseUrl, String storeId, long requestMs) {
		return create(baseUrl, storeId, STREAM_READ_MS, requestMs, SSE_MS);
	}

	/** 타임아웃 순서 검사를 보는 테스트용 - 나머지는 {@link #parserOnly()} 와 같다 */
	static OpenAiRealService withTimeouts(long streamReadMs, long sseMs) {
		return create(UNREACHABLE, "", streamReadMs, REQUEST_MS, sseMs);
	}

	private static OpenAiRealService create(String baseUrl, String storeId, long streamReadMs, long requestMs,
			long sseMs) {
		return new OpenAiRealService("test-key", "gpt-6-sol", storeId, baseUrl, streamReadMs, requestMs, sseMs, null);
	}
}
