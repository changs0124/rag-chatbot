package com.ragchatbot.config;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 가입 이메일 도메인 화이트리스트(FEAT-AUTH-001 · REQ-AUTH-007).
 *
 * <p>종전에는 {@code /api/auth/signup} 이 permitAll 이고 검증이 형식뿐이라 <b>URL 에 닿는 누구나
 * 계정을 만들고 사내 문서 기반 답변을 받을 수 있었다.</b> 백엔드를 인터넷에 노출하는 순간 성립하는 위험이다.
 *
 * <p><b>{@code live} 에서는 명단이 비면 기동을 막는다</b>({@code OpenAiRealService} 와 같은 fail-fast).
 * "비면 전원 허용"으로 두면 배포에서 변수를 빠뜨렸을 때 <b>조용히 가입이 열려</b> 지금 고치려는 상태로
 * 되돌아가는데 아무도 모른다. 반대로 {@code mock} 까지 필수로 두면 개발과 통합 테스트가 전부 멎는다 -
 * 통합 테스트가 매 케이스 가입하기 때문이다.
 */
@Component
public class SignupPolicy {

	private final List<String> allowedDomains;
	private final List<String> adminEmails;

	public SignupPolicy(
			@Value("${app.mode:}") String mode,
			@Value("${app.auth.allowed-email-domains:}") String allowedDomains,
			@Value("${app.admin.emails:}") String adminEmails) {
		this.allowedDomains = parseDomains(allowedDomains);
		this.adminEmails = AdminRoleSynchronizer.parse(adminEmails);
		if ("live".equals(mode) && this.allowedDomains.isEmpty()) {
			throw new IllegalStateException(
					"APP_MODE=live 인데 ALLOWED_EMAIL_DOMAINS 가 비어 있음. 가입 허용 도메인을 env로 주입할 것");
		}
	}

	/** 도메인 명단 파싱. {@code @} 를 붙여 적어도 받아 준다 - 헷갈리기 쉬운 표기라 기동을 막을 이유가 없다 */
	static List<String> parseDomains(String raw) {
		if (raw == null || raw.isBlank()) {
			return List.of();
		}
		return Arrays.stream(raw.split(","))
				.map(s -> s.trim().toLowerCase(Locale.ROOT))
				.map(s -> s.startsWith("@") ? s.substring(1) : s)
				.filter(s -> !s.isEmpty())
				.distinct()
				.toList();
	}

	/**
	 * 가입을 허용할 이메일인지. <b>소문자로 정규화된 이메일</b>을 넘길 것.
	 *
	 * <p>명단이 비면 전원 허용이다 - {@code live} 에서는 생성자가 이미 기동을 막았으므로
	 * 이 분기가 도는 것은 {@code mock} 뿐이다.
	 *
	 * <p><b>관리자 명단에 있는 주소는 도메인과 무관하게 허용한다.</b> 관리자 이메일이 허용 도메인
	 * 밖이면 관리자를 만들 수 없어 부트스트랩이 막힌다. 명단 자체가 배포 설정이라 이미 통제되어 있다.
	 */
	public boolean isAllowed(String normalizedEmail) {
		if (allowedDomains.isEmpty() || adminEmails.contains(normalizedEmail)) {
			return true;
		}
		int at = normalizedEmail.lastIndexOf('@');
		if (at < 0) {
			return false; // @Email 검증이 먼저 거르지만, 이 메서드만 놓고도 안전하게
		}
		// **정확히 일치**만 허용한다. 접미사 매칭으로 두면 evil-company.com 이 company.com 을 통과한다
		return allowedDomains.contains(normalizedEmail.substring(at + 1));
	}

	/** 거절 메시지. 허용 도메인을 밝힌다 - 사내 도메인은 비밀이 아니고, 숨기면 문의만 는다 */
	public String rejectionMessage() {
		return "가입이 허용되지 않은 이메일 도메인임 (허용: " + String.join(" · ", allowedDomains) + ")";
	}
}
