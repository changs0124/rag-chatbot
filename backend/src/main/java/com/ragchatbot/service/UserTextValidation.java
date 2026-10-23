package com.ragchatbot.service;

import com.ragchatbot.exception.ApiExceptions.BadRequestException;

/** DB 가 거절하거나 인코더가 대체할 문자는 저장·모델 호출 전에 거절해 사용자가 쓴 내용을 보존한다. */
final class UserTextValidation {

	private UserTextValidation() {
	}

	static void requireValid(String text) {
		// trim 이 끝의 NUL 을 지우므로 반드시 원문을 검사한다.
		for (int i = 0; i < text.length(); i++) {
			char ch = text.charAt(i);
			if (ch == '\0') {
				throw new BadRequestException("NUL 문자는 쓸 수 없음");
			}
			if (Character.isHighSurrogate(ch) && i + 1 < text.length()
					&& Character.isLowSurrogate(text.charAt(i + 1))) {
				i++;
			} else if (Character.isSurrogate(ch)) {
				throw new BadRequestException("짝이 맞지 않는 유니코드 서로게이트는 쓸 수 없음");
			}
		}
	}
}
