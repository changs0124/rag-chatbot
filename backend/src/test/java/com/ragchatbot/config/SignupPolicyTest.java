package com.ragchatbot.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * 가입 도메인 화이트리스트 판정 (FEAT-AUTH-001 · TC-AUTH-003~007 · 009 · 010).
 *
 * <p>DB 를 띄우지 않고 확인할 수 있는 부분이라 단위 테스트로 분리했다.
 * HTTP 계약(상태 코드·검사 순서)은 {@code AuthDomainAllowlistTest} 가 본다.
 */
class SignupPolicyTest {

	private static SignupPolicy policy(String mode, String domains, String admins) {
		return new SignupPolicy(mode, domains, admins);
	}

	@Test
	void allowed_domain_passes() {
		assertThat(policy("mock", "company.com", "").isAllowed("hong@company.com")).isTrue();
	}

	@Test
	void other_domain_is_rejected() {
		assertThat(policy("mock", "company.com", "").isAllowed("someone@gmail.com")).isFalse();
	}

	/** TC-AUTH-004 : 서브도메인은 허용되지 않는다 */
	@Test
	void subdomain_is_not_allowed() {
		assertThat(policy("mock", "company.com", "").isAllowed("hong@mail.company.com")).isFalse();
	}

	/**
	 * TC-AUTH-005 : 도메인만 비슷한 주소는 막힌다.
	 *
	 * <p>앞 케이스와 짝이다 - 둘 중 하나만 있으면 접미사 매칭 구현이 통과한다.
	 */
	@Test
	void lookalike_domain_is_rejected() {
		assertThat(policy("mock", "company.com", "").isAllowed("attacker@evil-company.com")).isFalse();
	}

	/** TC-AUTH-006 : 여러 도메인 */
	@Test
	void multiple_domains_are_allowed() {
		SignupPolicy p = policy("mock", "company.com,partner.co.kr", "");
		assertThat(p.isAllowed("a@company.com")).isTrue();
		assertThat(p.isAllowed("b@partner.co.kr")).isTrue();
		assertThat(p.isAllowed("c@other.com")).isFalse();
	}

	/** TC-AUTH-007 : 관리자 명단은 도메인 검사를 면제받는다 - 없으면 부트스트랩이 막힌다 */
	@Test
	void admin_list_bypasses_domain_check() {
		SignupPolicy p = policy("mock", "company.com", "ops@outside.dev");
		assertThat(p.isAllowed("ops@outside.dev")).isTrue();
		assertThat(p.isAllowed("other@outside.dev")).isFalse();
	}

	/** TC-AUTH-009 : mock 이고 명단이 비면 전원 허용 - 여기까지 막으면 통합 테스트가 전부 멎는다 */
	@Test
	void empty_list_in_mock_allows_everyone() {
		assertThat(policy("mock", "", "").isAllowed("anyone@anywhere.dev")).isTrue();
	}

	/**
	 * TC-AUTH-010 : live 인데 명단이 비면 기동에 실패한다.
	 *
	 * <p>"비면 전원 허용"으로 두면 배포에서 변수를 빠뜨렸을 때 조용히 가입이 열린다.
	 */
	@Test
	void empty_list_in_live_fails_fast() {
		assertThatThrownBy(() -> policy("live", "", ""))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("ALLOWED_EMAIL_DOMAINS");
	}

	@Test
	void live_with_domains_starts() {
		assertThat(policy("live", "company.com", "").isAllowed("hong@company.com")).isTrue();
	}

	/** 표기 흔들림 흡수 - 공백·대문자·`@` 접두·중복 */
	@Test
	void domain_list_is_normalized() {
		assertThat(SignupPolicy.parseDomains(" @Company.COM , company.com ,, partner.co.kr "))
				.isEqualTo(List.of("company.com", "partner.co.kr"));
	}

	/** 거절 메시지는 허용 도메인을 밝힌다 - 숨기면 "왜 안 되는지 모르겠다"는 문의만 는다 */
	@Test
	void rejection_message_names_allowed_domains() {
		assertThat(policy("mock", "company.com,partner.co.kr", "").rejectionMessage())
				.contains("company.com")
				.contains("partner.co.kr");
	}
}
