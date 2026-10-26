package com.ragchatbot.openai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * #470 : 답 본문에 옮겨 적힌 검색 결과 파일 이름이 짧은 문서 이름으로 바뀌는지 고정함.
 * 문장 모양은 2026-10-26 운영 QA 답에서 가져옴.
 */
class SourceNameRewriterTest {

	private static final String MANUAL = "TM매뉴얼_VSVDTMNOPK10_v3.md";
	private static final String CLAIMS = "필드클레임현황.md";

	private static String run(String... deltas) {
		SourceNameRewriter r = new SourceNameRewriter();
		r.addNames(List.of(MANUAL, CLAIMS));
		StringBuilder out = new StringBuilder();
		for (String d : deltas) {
			out.append(r.accept(d));
		}
		return out.append(r.flush()).toString();
	}

	@Test
	void file_name_with_extension_becomes_short_name() {
		assertThat(run("다만 **" + MANUAL + "의 서보 드라이브 사양표에는** 80 A")).isEqualTo("다만 **TM매뉴얼의 서보 드라이브 사양표에는** 80 A");
	}

	@Test
	void file_name_without_extension_becomes_short_name() {
		assertThat(run("TM매뉴얼_VSVDTMNOPK10_v3의 배선 기준은 3 m")).isEqualTo("TM매뉴얼의 배선 기준은 3 m");
	}

	@Test
	void name_split_across_deltas_is_replaced() {
		assertThat(run("아래는 「TM매뉴얼_VSV", "DTMNOPK10_v3", ".md」의 순서")).isEqualTo("아래는 「TM매뉴얼」의 순서");
	}

	@Test
	void stem_at_delta_end_waits_for_a_possible_extension() {
		SourceNameRewriter r = new SourceNameRewriter();
		r.addNames(List.of(MANUAL));
		assertThat(r.accept("근거는 TM매뉴얼_VSVDTMNOPK10_v3")).isEqualTo("근거는 "); // 뒤에 「.md」 가 올 수 있음
		assertThat(r.accept(".md 입니다")).isEqualTo("TM매뉴얼 입니다");
	}

	@Test
	void every_cut_inside_the_name_gives_the_same_result() {
		// 「…_v3.」 | 「md」 처럼 확장자 점 뒤에서 잘려도 앞부분만 먼저 바뀌어 「.md」 가 남지 않음
		String text = "아래는 *" + MANUAL + "*의 터릿";
		for (int cut = 1; cut < text.length(); cut++) {
			assertThat(run(text.substring(0, cut), text.substring(cut))).as("cut %d", cut).isEqualTo("아래는 *TM매뉴얼*의 터릿");
		}
	}

	@Test
	void name_without_underscore_only_loses_extension() {
		assertThat(run(CLAIMS + " 기준으로 115건")).isEqualTo("필드클레임현황 기준으로 115건");
		assertThat(run("필드클레임현황에 기록된 건")).isEqualTo("필드클레임현황에 기록된 건");
	}

	@Test
	void prefix_of_a_name_is_held_then_flushed_unchanged() {
		SourceNameRewriter r = new SourceNameRewriter();
		r.addNames(List.of(MANUAL));
		assertThat(r.accept("자료 TM매뉴")).isEqualTo("자료 ");
		assertThat(r.flush()).isEqualTo("TM매뉴");
	}

	@Test
	void text_without_search_names_is_returned_as_is() {
		SourceNameRewriter r = new SourceNameRewriter();
		String text = "TM매뉴얼_VSVDTMNOPK10_v3.md 는 검색 결과에 없던 이름";
		assertThat(r.accept(text)).isSameAs(text);
	}

	@Test
	void short_names_already_written_by_the_model_are_untouched() {
		assertThat(run("TM 매뉴얼과 필드 클레임 현황을 함께 보면")).isEqualTo("TM 매뉴얼과 필드 클레임 현황을 함께 보면");
	}

	@Test
	void markup_filter_inserted_name_follows_the_same_rule() {
		// #429 : 표기가 명사 자리에 오면 필터가 문서 이름을 넣는다 - 그 이름도 짧은 이름으로 나감
		CitationMarkupFilter f = new CitationMarkupFilter();
		f.addSearch(List.of(MANUAL));
		String mark = (char) 0xE200 + "filecite" + (char) 0xE202 + "turn0file0" + (char) 0xE201;
		String out = f.accept("기록은 " + mark + "에서 확인됩니다.") + f.flush();
		assertThat(out).isEqualTo("기록은 TM매뉴얼에서 확인됩니다.");
	}
}
