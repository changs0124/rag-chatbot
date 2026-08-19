package com.ragchatbot.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * 관리자 명단 파싱 (FEAT-ADMIN-001 · TC-ADMIN-003 · 005 의 단위 부분).
 *
 * <p>정규화가 앱의 이메일 정규화와 <b>같은 눈금</b>이어야 대소문자만 다른 명단도 맞는다.
 * DB를 띄우지 않고 확인할 수 있는 부분이라 단위 테스트로 분리했다.
 */
class AdminRoleSynchronizerTest {

	/** TC-ADMIN-005 : 미설정이면 관리자가 0명 */
	@Test
	void blank_list_yields_no_admins() {
		assertThat(AdminRoleSynchronizer.parse(null)).isEmpty();
		assertThat(AdminRoleSynchronizer.parse("")).isEmpty();
		assertThat(AdminRoleSynchronizer.parse("   ")).isEmpty();
	}

	/** TC-ADMIN-003 : 대소문자를 가리지 않는다 */
	@Test
	void emails_are_lowercased() {
		assertThat(AdminRoleSynchronizer.parse("OPS@Company.com"))
				.containsExactly("ops@company.com");
	}

	@Test
	void list_is_split_trimmed_and_deduped() {
		assertThat(AdminRoleSynchronizer.parse(" a@b.com , A@B.com ,, c@d.com "))
				.isEqualTo(List.of("a@b.com", "c@d.com"));
	}
}
