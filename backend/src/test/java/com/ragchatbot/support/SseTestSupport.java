package com.ragchatbot.support;

import java.util.ArrayList;
import java.util.List;

/** SSE 본문을 읽는 테스트 공용 도우미 - 테스트 클래스끼리 서로 기대지 않게 여기에 둔다(#329) */
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
}
