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
 * 표기가 여러 delta 에 걸쳐 와도 상태가 이어지므로 표기 자체는 붙잡아 둘 필요가 없음(뒤 공백만 보류 - 아래 #429).
 * 닫히지 않은 채 스트림이 끝나면 나머지는 버림(본문으로 내보낼 근거가 없음).
 *
 * <p>버린 표기 안의 {@code turnNfileM} 은 {@link #fileRefs()} 로 꺼냄 - annotation 없이 답한 턴의
 * 출처를 복원하는 데 씀(#281).
 *
 * <p>표기가 문서 이름 자리에 오면(「기록은 &lt;표기&gt;, …」 · 「기록은 &lt;표기&gt;에서」) 지우기만 해서는 빈칸이 남음(#372 · #429).
 * 그래서 표기를 닫은 뒤 이어지는 공백을 첫 글자가 올 때까지 보류하고, 앞이 조사 + 공백(붙어 쓴 것은 「은 · 는」만)이며
 * 뒤가 쉼표 · 조사(「에 · 의 · 와 …」)면
 * 확장자를 뺀 문서 이름을 그 자리에 넣음. 이름은 {@link #addSearch} 로 받은 검색 결과에서 같은 {@code turnNfileM}
 * 규칙으로 찾음 - 검색 결과가 본문보다 먼저 도착하므로 스트림 도중에 풀림. 그 밖의 표기는 지금처럼 지우기만 함.
 * 스트림이 끝나면 {@link #flush()} 로 보류한 공백을 받아 감.
 *
 * <p>스트림 하나에 인스턴스 하나. 스레드 안전하지 않음.
 */
final class CitationMarkupFilter {

	private static final char START = '';
	private static final char END = '';
	private static final char SEP = '';
	// 자릿수를 묶는다(#359) - 모델이 낸 아주 긴 숫자가 parseInt 에서 터지면 이미 토큰을 보낸 스트림이 오류로 끝난다
	private static final Pattern FILE_REF = Pattern.compile("turn(\\d{1,9})file(\\d{1,9})");

	/** 표기 안 {@code turnNfileM} 하나. N = 몇 번째 file_search 호출, M = 그 호출의 몇 번째 결과(둘 다 0-base) */
	record FileRef(int turn, int file) {
	}

	// 명사 자리 판정(#429). 「이 · 가 · 도 · 로 · 과」 같은 글자는 명사 끝(결과 · 온도 · 회로)이나 단어 첫 글자(이상 · 이후)로도
	// 흔해서 넣지 않음 - 넣으면 「점검 결과 <표기> 이상 없음」 같은 정상 문장에 이름이 끼어듦
	private static final String PARTICLE_BEFORE = "은는을를";
	private static final String PARTICLE_AFTER = ",에의와과을를";
	// 확장자로 볼 꼬리 - 마지막 점을 다 자르면 「매뉴얼 v1.2」 가 「매뉴얼 v1」 이 됨
	private static final Pattern EXTENSION = Pattern.compile("\\.(md|txt|pdf|docx?|xlsx?|csv|json|html?)$",
			Pattern.CASE_INSENSITIVE);

	private boolean inside;
	private final StringBuilder body = new StringBuilder();
	private final List<FileRef> refs = new ArrayList<>();
	private final List<List<String>> searches = new ArrayList<>();
	// 표기를 닫은 뒤 첫 글자를 기다리는 중 - 그동안의 공백은 held 에 모아 둠
	private boolean pending;
	private String pendingName;
	private final StringBuilder held = new StringBuilder();
	// 표기 밖으로 내보낸 마지막 두 글자(last1 이 가장 최근)
	private char last1;
	private char last2;

	/** file_search 호출 하나의 결과 파일명, 결과 순서대로(이름이 비어도 자리를 지킴 - turnNfileM 의 M 이 이 순서) */
	void addSearch(List<String> filenames) {
		searches.add(List.copyOf(filenames));
	}

	/** delta 에서 표기 밖 글자만 돌려줌. 전부 표기면 빈 문자열 */
	String accept(String delta) {
		if (!inside && !pending && delta.indexOf(START) < 0) {
			for (int i = 0; i < delta.length(); i++) {
				remember(delta.charAt(i));
			}
			return delta; // 표기가 없는 흔한 경우엔 원문을 그대로 돌려줌
		}
		StringBuilder out = new StringBuilder(delta.length());
		for (int i = 0; i < delta.length(); i++) {
			char c = delta.charAt(i);
			if (inside) {
				if (c == END) {
					inside = false;
					String name = collect();
					// 표기가 공백을 두고 이어지면 보류를 이어 감 - 앞 표기의 이름이 풀렸으면 그것을 씀
					pendingName = pending && pendingName != null ? pendingName : name;
					pending = true;
				} else {
					body.append(c);
				}
				continue;
			}
			if (pending) {
				if (c == ' ') {
					held.append(c);
					continue;
				}
				if (c != START) {
					resolve(out, c);
				}
			}
			if (c == START) {
				inside = true;
				body.setLength(0);
			} else {
				emit(out, c);
			}
		}
		return out.toString();
	}

	/** 스트림 끝에 보류 중이던 공백. 없으면 빈 문자열 */
	String flush() {
		pending = false;
		String rest = held.toString();
		held.setLength(0);
		return rest;
	}

	/** 닫힌 filecite 표기에서 모은 파일 참조, 나온 순서대로 */
	List<FileRef> fileRefs() {
		return List.copyOf(refs);
	}

	/** 표기 뒤 첫 글자 c 가 왔을 때 보류분을 내보냄 - 명사 자리면 문서 이름, 아니면 모아 둔 공백 그대로 */
	private void resolve(StringBuilder out, char c) {
		pending = false;
		boolean afterParticle = last1 == '은' || last1 == '는' || (last1 == ' ' && PARTICLE_BEFORE.indexOf(last2) >= 0);
		if (pendingName != null && afterParticle && PARTICLE_AFTER.indexOf(c) >= 0) {
			if (last1 != ' ') {
				emit(out, ' ');
			}
			for (int i = 0; i < pendingName.length(); i++) {
				emit(out, pendingName.charAt(i));
			}
		} else {
			for (int i = 0; i < held.length(); i++) {
				emit(out, held.charAt(i));
			}
		}
		held.setLength(0);
	}

	private void emit(StringBuilder out, char c) {
		out.append(c);
		remember(c);
	}

	private void remember(char c) {
		last2 = last1;
		last1 = c;
	}

	/** 표기 안 파일 참조를 모으고, 이름으로 풀리는 첫 참조의 문서 이름(확장자 뺌)을 돌려줌. 없으면 null */
	private String collect() {
		String[] parts = body.toString().split(String.valueOf(SEP));
		if (!"filecite".equals(parts[0])) {
			return null; // 파일 인용이 아닌 표기는 출처 근거로 쓰지 않음
		}
		String name = null;
		for (int i = 1; i < parts.length; i++) {
			Matcher m = FILE_REF.matcher(parts[i]);
			if (m.matches()) {
				FileRef ref = new FileRef(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)));
				refs.add(ref);
				if (name == null) {
					name = nameOf(ref);
				}
			}
		}
		return name;
	}

	private String nameOf(FileRef ref) {
		if (ref.turn() >= searches.size() || ref.file() >= searches.get(ref.turn()).size()) {
			return null;
		}
		String file = searches.get(ref.turn()).get(ref.file());
		String name = EXTENSION.matcher(file).replaceFirst("");
		return name.isBlank() ? null : name;
	}
}
