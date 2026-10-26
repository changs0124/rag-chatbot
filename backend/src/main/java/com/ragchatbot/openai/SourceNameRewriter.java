package com.ragchatbot.openai;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 답 본문에 옮겨 적힌 검색 결과 파일 이름을 짧은 문서 이름으로 바꿈(#470).
 *
 * <p>모델은 어느 문서인지 글로 밝힐 때 파일 이름을 확장자 · 문서 코드째 옮김(「TM매뉴얼_VSVDTMNOPK10_v3.md의 …」).
 * 지시문으로 막으면 인용 표기까지 빠뜨리는 답이 늘어 「자료 없음」이 잘못 뜸(2026-10-26 실측, 배터리 124회 중 1 → 5) -
 * 그래서 모델은 그대로 두고 화면 · 저장본으로 나가기 전에 바꿈.
 *
 * <p>짧은 이름 = 확장자를 빼고 첫 {@code _} 앞까지(「TM매뉴얼_VSVDTMNOPK10_v3.md」 → 「TM매뉴얼」). {@code _} 가 없으면
 * 확장자만 뺌(「필드클레임현황.md」 → 「필드클레임현황」). 바꾸는 대상은 {@link #addNames} 로 받은 검색 결과 이름뿐이라
 * 사용자가 쓴 다른 글자는 건드리지 않음. 출처 목록(sourceName)은 파일 이름 그대로 둠.
 *
 * <p>이름이 delta 사이에서 잘려 올 수 있어, 버퍼 끝이 어떤 이름의 앞부분이면 다음 delta 까지 붙잡아 둠.
 * 스트림이 끝나면 {@link #flush()} 로 남은 것을 받아 감. 스트림 하나에 인스턴스 하나. 스레드 안전하지 않음.
 */
final class SourceNameRewriter {

	// CitationMarkupFilter 와 같은 꼬리 규칙 - 마지막 점을 다 자르면 「매뉴얼 v1.2」 가 「매뉴얼 v1」 이 됨
	private static final Pattern EXTENSION = Pattern.compile("\\.(md|txt|pdf|docx?|xlsx?|csv|json|html?)$",
			Pattern.CASE_INSENSITIVE);

	private final Map<String, String> shortByName = new LinkedHashMap<>();
	private Pattern names; // 긴 이름부터 - 「…_v3.md」 가 「…_v3」 보다 먼저 맞아야 확장자가 남지 않음
	private final StringBuilder held = new StringBuilder();

	/** 검색 결과 파일 이름들. 같은 이름이 다시 와도 됨 */
	void addNames(List<String> filenames) {
		boolean added = false;
		for (String file : filenames) {
			if (file == null || file.isBlank() || shortByName.containsKey(file)) {
				continue;
			}
			String stem = EXTENSION.matcher(file).replaceFirst("");
			int bar = stem.indexOf('_');
			String shortName = bar > 0 ? stem.substring(0, bar) : stem;
			if (shortName.isBlank()) {
				continue;
			}
			for (String variant : List.of(file, stem)) {
				if (!variant.equals(shortName) && !shortByName.containsKey(variant)) {
					shortByName.put(variant, shortName);
					added = true;
				}
			}
		}
		if (added) {
			List<String> keys = new ArrayList<>(shortByName.keySet());
			keys.sort(Comparator.comparingInt(String::length).reversed());
			names = Pattern.compile(String.join("|", keys.stream().map(Pattern::quote).toList()));
		}
	}

	/** 바꾼 글자를 돌려줌. 이름의 앞부분일 수 있는 꼬리는 붙잡아 둠 */
	String accept(String delta) {
		if (names == null) {
			return delta; // 검색 결과가 없으면 바꿀 이름도 없음 - 원문 그대로
		}
		held.append(delta);
		String buf = held.toString();
		int hold = holdFrom(buf);
		held.setLength(0);
		held.append(buf, hold, buf.length());
		return replace(buf.substring(0, hold));
	}

	/** 스트림 끝에 붙잡아 둔 꼬리. 이름의 앞부분일 뿐이었으면 그대로 */
	String flush() {
		String rest = replace(held.toString());
		held.setLength(0);
		return rest;
	}

	/** 붙잡을 꼬리의 시작 위치. 마지막 일치 뒤에서 어떤 이름의 앞부분으로 끝나는 가장 긴 꼬리 */
	private int holdFrom(String buf) {
		Matcher m = names.matcher(buf);
		int lastStart = -1;
		int lastEnd = 0;
		while (m.find()) {
			lastStart = m.start();
			lastEnd = m.end();
		}
		// 마지막 일치부터 끝까지가 더 긴 이름의 앞부분이면(「…_v3」 · 「…_v3.」 뒤에 「md」 가 올 수 있음) 일치째 붙잡음
		if (lastStart >= 0 && isProperPrefix(buf.substring(lastStart))) {
			return lastStart;
		}
		for (int i = lastEnd; i < buf.length(); i++) {
			if (isProperPrefix(buf.substring(i))) {
				return i;
			}
		}
		return buf.length();
	}

	private boolean isProperPrefix(String tail) {
		for (String name : shortByName.keySet()) {
			if (name.length() > tail.length() && name.startsWith(tail)) {
				return true;
			}
		}
		return false;
	}

	private String replace(String text) {
		if (text.isEmpty()) {
			return text;
		}
		Matcher m = names.matcher(text);
		if (!m.find()) {
			return text;
		}
		return m.replaceAll(r -> Matcher.quoteReplacement(shortByName.get(r.group())));
	}
}
