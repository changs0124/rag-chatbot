package com.ragchatbot.openai;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 출처 스니펫 고르기(#268). {@code OpenAiRealService} 에서 떼어 냄(#389) - 상태 없는 순수 함수라
 * 서비스 인스턴스 없이 테스트한다.
 */
final class SnippetPicker {

	private static final Pattern FIGURE_MARK = Pattern.compile("\\[\\[그림:[^\\]]+\\]\\]");

	private SnippetPicker() {
	}

	/**
	 * 한 파일의 검색 결과 중 답이 근거로 쓴 청크를 고름(#268). annotation 에는 어느 청크인지가 없어,
	 * 1순위를 쓰면 답과 무관한 단락이 출처로 보인다.
	 * <ol>
	 *   <li>답에 나온 그림 표식을 담은 청크 - 그림은 그 절에서만 나옴</li>
	 *   <li>답과 겹치는 글자 2-gram(공백 제외) 종류가 가장 많은 청크. 동점은 앞 순위</li>
	 *   <li>겹침이 전혀 없으면 1순위(빈 스니펫을 만들지 않음)</li>
	 * </ol>
	 * 청크는 800토큰이라 앞부분이 옆 절일 수 있음 - 화면에는 앞 200자만 보이므로 고른 청크 안에서도
	 * 그림 표식 자리, 없으면 답과 가장 많이 겹치는 줄부터 잘라 돌려줌.
	 */
	static String pickSnippet(List<String> chunks, String answer) {
		if (chunks.isEmpty()) {
			return "";
		}
		Set<String> answerGrams = bigrams(answer);
		Matcher m = FIGURE_MARK.matcher(answer);
		while (m.find()) {
			for (String c : chunks) {
				int at = c.indexOf(m.group());
				if (at >= 0) {
					return c.substring(at);
				}
			}
		}
		String best = chunks.get(0);
		int bestScore = 0;
		for (String c : chunks) {
			int score = overlap(c, answerGrams);
			if (score > bestScore) {
				best = c;
				bestScore = score;
			}
		}
		return best.substring(bestLineStart(best, answerGrams));
	}

	/** 답과 가장 많이 겹치는 줄의 시작 위치. 겹치는 줄이 없으면 0 */
	private static int bestLineStart(String chunk, Set<String> answerGrams) {
		int bestStart = 0;
		int bestScore = 0;
		int start = 0;
		for (String line : chunk.split("\n", -1)) {
			int score = overlap(line, answerGrams);
			if (score > bestScore) {
				bestStart = start;
				bestScore = score;
			}
			start += line.length() + 1;
		}
		return bestStart;
	}

	private static int overlap(String text, Set<String> answerGrams) {
		Set<String> grams = bigrams(text);
		grams.retainAll(answerGrams);
		return grams.size();
	}

	private static Set<String> bigrams(String s) {
		String t = s.replaceAll("\\s+", "");
		Set<String> grams = new HashSet<>();
		for (int i = 0; i + 1 < t.length(); i++) {
			grams.add(t.substring(i, i + 2));
		}
		return grams;
	}

	/** 출처 스니펫을 버블 분량으로 제한(UI 2줄 클램프보다 조금 넉넉하게) */
	static String truncate(String s) {
		if (s == null) {
			return "";
		}
		String flat = s.replaceAll("\\s+", " ").trim();
		if (flat.length() <= 200) {
			return flat;
		}
		// 200번째 자리에서 서로게이트 쌍이 갈리면 한 칸 줄인다(#485) - 반쪽 글자가 DB 에 깨져 남음
		int end = Character.isHighSurrogate(flat.charAt(199)) ? 199 : 200;
		return flat.substring(0, end) + "…";
	}
}
