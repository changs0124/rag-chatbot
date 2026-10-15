package com.ragchatbot.openai;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 답 본문에 섞여 오는 인용 표기 원문을 걷어 냄(#277).
 *
 * <p>sol 계열 모델은 출처 annotation 과 별개로 본문에 {@code U+E200 filecite U+E202 turn0file2 U+E201}
 * 같은 표기를 그대로 흘림. 시작(U+E200)·끝(U+E201)이 사설 영역 한 글자라 표기 안/밖 상태 하나로 충분함 -
 * 표기가 여러 delta 에 걸쳐 와도 상태가 이어지므로 글자를 붙잡아 둘 필요가 없음.
 * 닫히지 않은 채 스트림이 끝나면 나머지는 버림(본문으로 내보낼 근거가 없음).
 *
 * <p>버린 표기 안의 {@code turnNfileM} 은 {@link #fileRefs()} 로 꺼냄 - annotation 없이 답한 턴의
 * 출처를 복원하는 데 씀(#281).
 *
 * <p>스트림 하나에 인스턴스 하나. 스레드 안전하지 않음.
 */
final class CitationMarkupFilter {

	private static final char START = '';
	private static final char END = '';
	private static final char SEP = '';
	private static final Pattern FILE_REF = Pattern.compile("turn(\\d+)file(\\d+)");

	/** 표기 안 {@code turnNfileM} 하나. N = 몇 번째 file_search 호출, M = 그 호출의 몇 번째 결과(둘 다 0-base) */
	record FileRef(int turn, int file) {
	}

	private boolean inside;
	private final StringBuilder body = new StringBuilder();
	private final List<FileRef> refs = new ArrayList<>();

	/** delta 에서 표기 밖 글자만 돌려줌. 전부 표기면 빈 문자열 */
	String accept(String delta) {
		StringBuilder out = null; // 표기가 없는 흔한 경우엔 원문을 그대로 돌려줌
		for (int i = 0; i < delta.length(); i++) {
			char c = delta.charAt(i);
			boolean drop = inside || c == START;
			if (c == START) {
				inside = true;
				body.setLength(0);
			} else if (c == END && inside) {
				inside = false;
				collect();
			} else if (inside) {
				body.append(c);
			}
			if (drop && out == null) {
				out = new StringBuilder(delta.length()).append(delta, 0, i);
			} else if (!drop && out != null) {
				out.append(c);
			}
		}
		return out == null ? delta : out.toString();
	}

	/** 닫힌 filecite 표기에서 모은 파일 참조, 나온 순서대로 */
	List<FileRef> fileRefs() {
		return List.copyOf(refs);
	}

	private void collect() {
		String[] parts = body.toString().split(String.valueOf(SEP));
		if (!"filecite".equals(parts[0])) {
			return; // 파일 인용이 아닌 표기는 출처 근거로 쓰지 않음
		}
		for (int i = 1; i < parts.length; i++) {
			Matcher m = FILE_REF.matcher(parts[i]);
			if (m.matches()) {
				refs.add(new FileRef(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))));
			}
		}
	}
}
