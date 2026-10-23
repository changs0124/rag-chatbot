package com.ragchatbot.service;

import com.ragchatbot.exception.ApiExceptions.BadRequestException;

/**
 * 사용자 텍스트 입력의 문자 검사(#434). 길이 검사(#371 · #413)와 같은 자리에서 저장 · 모델 호출 전에 부른다.
 *
 * <p><b>NUL(U+0000)</b> — PostgreSQL 은 text 에 0x00 을 저장하지 못해 INSERT/UPDATE 가 500 으로 터졌다. {@code trim()} 은
 * 끝의 NUL 만 지워 가운데 NUL 은 그대로 DB 까지 갔다(채팅 · 대화 제목 · 이름 다섯 경로, 10-23 운영 QA).
 *
 * <p><b>짝 없는 서로게이트</b> — JSON 이스케이프로 온 반쪽 서로게이트(예 : D800 하나)는 Jackson 이 그대로 받아들이지만, 모델 요청 본문으로 다시 직렬화하면
 * OpenAI 가 {@code invalid_json} 으로 거절해 그 턴이 스트림 오류로 끝났다. 사용자가 고칠 수 있게 미리 거절한다.
 *
 * <p>지우고 통과시키지 않는다 - 사용자가 쓴 것과 다른 값이 조용히 남는다(길이 상한과 같은 결).
 */
final class TextInputs {

	private TextInputs() {
	}

	static String requireStorable(String value, String field) {
		for (int i = 0; i < value.length(); i++) {
			char c = value.charAt(i);
			boolean pairedHigh = Character.isHighSurrogate(c) && i + 1 < value.length()
					&& Character.isLowSurrogate(value.charAt(i + 1));
			if (pairedHigh) {
				i++;
				continue;
			}
			if (c == 0 || Character.isSurrogate(c)) {
				throw new BadRequestException(field + "에 쓸 수 없는 문자가 있음 (NUL 또는 깨진 문자)");
			}
		}
		return value;
	}
}
