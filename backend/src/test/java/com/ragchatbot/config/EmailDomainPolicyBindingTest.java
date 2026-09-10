package com.ragchatbot.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * 도메인 화이트리스트의 <b>프로퍼티 바인딩</b>을 컨텍스트로 확인 (REQ-AUTH-007 · FEAT-AUTH-001).
 *
 * <p><b>{@link EmailDomainPolicyTest} 와 나눈 이유</b> : 그쪽은 판정 로직(서브도메인 · 유사 도메인 ·
 * 관리자 면제 · 정규화)을 보고 <b>생성자를 직접 호출</b>한다. 그래서 {@code @Value} 키가 바뀌거나
 * 오타가 나도 초록이다 - 값이 실제로 그 자리에 꽂히는지는 보지 않기 때문이다.
 *
 * <p>키가 어긋나면 두 방향으로 망가지는데 <b>한쪽은 조용하다</b> :
 * <ul>
 * <li>도메인 키만 어긋남 → live 에서 값을 제대로 넣어도 늘 기동 실패(시끄럽다)</li>
 * <li><b>mode 키가 어긋남 → {@code "live".equals(mode)} 가 거짓이 되어 fail-fast 자체가 사라진다.</b>
 * 그러면 {@code isAllowed} 의 「명단이 비면 전원 허용」 분기가 돌아 <b>모든 도메인에 계정 발급이
 * 열린다.</b> 화면에도 로그에도 아무 표시가 없다</li>
 * </ul>
 *
 * <p>{@code AppModeGuardTest} 가 2026-07-28 Phase 0 리뷰(M-1)에서 같은 이유로 이 형태로 옮겨 갔다.
 * 이 클래스만 옛 형태로 남아 있었다. {@code ApplicationContextRunner} 라 Docker 도 DB 도 필요 없다.
 */
class EmailDomainPolicyBindingTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withUserConfiguration(EmailDomainPolicy.class);

	/**
	 * 이 클래스의 핵심 - live 인데 명단이 비면 <b>기동하지 못한다</b>.
	 *
	 * <p>생성자 케이스와 달리 여기서는 {@code app.mode} 와 {@code app.auth.allowed-email-domains}
	 * 두 키가 모두 제 자리에 꽂혀야만 통과한다.
	 */
	@Test
	void live_without_domains_fails_to_start() {
		runner.withPropertyValues("app.mode=live")
				.run(ctx -> assertThat(ctx).hasFailed());
	}

	/** 빈 문자열을 명시해도 같다 - 미설정과 빈 값이 갈리면 배포에서 한쪽만 막힌다 */
	@Test
	void live_with_blank_domains_fails_to_start() {
		runner.withPropertyValues("app.mode=live", "app.auth.allowed-email-domains=")
				.run(ctx -> assertThat(ctx).hasFailed());
	}

	/**
	 * 반대편 - live 라도 명단이 있으면 뜬다.
	 *
	 * <p>이 케이스가 없으면 <b>무조건 실패하는 구현</b>도 위 두 케이스를 통과한다.
	 * 그리고 도메인 키가 어긋나 값이 안 꽂히는 경우가 바로 여기서 잡힌다.
	 */
	@Test
	void live_with_domains_starts() {
		runner.withPropertyValues("app.mode=live", "app.auth.allowed-email-domains=company.com")
				.run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(EmailDomainPolicy.class));
	}

	/**
	 * mock 은 명단이 비어도 뜬다 - 통합 테스트가 매 케이스 계정을 만들기 때문이다.
	 *
	 * <p>여기까지 막으면 개발과 통합 테스트가 전부 멎는다. 이 완화가 <b>mock 에만</b> 있다는 것이
	 * 위 두 케이스와 짝을 이뤄야 의미가 있다.
	 */
	@Test
	void mock_without_domains_starts() {
		runner.withPropertyValues("app.mode=mock")
				.run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(EmailDomainPolicy.class));
	}

	/**
	 * 관리자 명단 키도 실제로 꽂히는지 본다.
	 *
	 * <p>{@code app.admin.emails} 가 안 꽂히면 면제가 사라져 <b>관리자 부트스트랩이 막힌다</b> -
	 * 사외 주소를 쓰는 첫 관리자를 만들 수 없게 되는데, 계정을 스스로 만드는 경로가 없으므로
	 * 그 배포에서는 아무도 로그인하지 못한다.
	 */
	@Test
	void admin_emails_property_is_bound() {
		runner.withPropertyValues(
				"app.mode=live",
				"app.auth.allowed-email-domains=company.com",
				"app.admin.emails=ops@outside.dev")
				.run(ctx -> {
					assertThat(ctx).hasNotFailed();
					EmailDomainPolicy policy = ctx.getBean(EmailDomainPolicy.class);
					assertThat(policy.isAllowed("ops@outside.dev")).isTrue();
					assertThat(policy.isAllowed("other@outside.dev")).isFalse();
				});
	}
}
