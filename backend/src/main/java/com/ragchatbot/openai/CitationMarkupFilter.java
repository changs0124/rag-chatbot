package com.ragchatbot.openai;

/**
 * 답 본문에 섞여 오는 인용 표기 원문을 걷어 냄(#277).
 *
 * <p>sol 계열 모델은 출처 annotation 과 별개로 본문에 {@code U+E200 filecite U+E202 turn0file2 U+E201}
 * 같은 표기를 그대로 흘림. 시작(U+E200)·끝(U+E201)이 사설 영역 한 글자라 표기 안/밖 상태 하나로 충분함 -
 * 표기가 여러 delta 에 걸쳐 와도 상태가 이어지므로 글자를 붙잡아 둘 필요가 없음.
 * 닫히지 않은 채 스트림이 끝나면 나머지는 버림(본문으로 내보낼 근거가 없음).
 *
 * <p>스트림 하나에 인스턴스 하나. 스레드 안전하지 않음.
 */
final class CitationMarkupFilter {

	private static final char START = '';
	private static final char END = '';

	private boolean inside;

	/** delta 에서 표기 밖 글자만 돌려줌. 전부 표기면 빈 문자열 */
	String accept(String delta) {
		StringBuilder out = null; // 표기가 없는 흔한 경우엔 원문을 그대로 돌려줌
		for (int i = 0; i < delta.length(); i++) {
			char c = delta.charAt(i);
			boolean drop = inside || c == START;
			if (c == START) {
				inside = true;
			} else if (c == END && inside) {
				inside = false;
			}
			if (drop && out == null) {
				out = new StringBuilder(delta.length()).append(delta, 0, i);
			} else if (!drop && out != null) {
				out.append(c);
			}
		}
		return out == null ? delta : out.toString();
	}
}
