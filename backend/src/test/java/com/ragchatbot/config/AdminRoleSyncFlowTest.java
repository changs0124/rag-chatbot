package com.ragchatbot.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import com.ragchatbot.repository.UserRepository;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 관리자 명단 동기화 (FEAT-ADMIN-001 · TC-ADMIN-001 · 002 · 003 · 004).
 *
 * <p>기동 시 러너는 컨텍스트가 뜰 때 한 번 돌고 끝나므로, 여기서는 <b>매퍼를 직접 불러</b>
 * 같은 구문을 검증한다. 러너가 그 구문을 부른다는 사실은 명단이 주입된 이 컨텍스트에서
 * 가입 계정의 역할로 함께 드러난다.
 */
@TestPropertySource(properties = "app.admin.emails=boot-admin@b.com")
class AdminRoleSyncFlowTest extends AbstractPgIntegrationTest {

	@Autowired
	private UserRepository userRepository;

	private String roleOf(String email) {
		return jdbc.queryForObject("select role from users where email = ?", String.class, email);
	}

	/** TC-ADMIN-001 : 명단에 있는 계정이 admin 으로 승격된다 */
	@Test
	void listed_account_is_promoted() {
		signup("promote-me@b.com");
		assertThat(roleOf("promote-me@b.com")).isEqualTo("user");

		userRepository.promoteAdmins(List.of("promote-me@b.com"));

		assertThat(roleOf("promote-me@b.com")).isEqualTo("admin");
	}

	/**
	 * TC-ADMIN-002 : 명단에서 빠진 계정은 다시 강등된다.
	 *
	 * <p>승격만 검사하고 강등을 빼면, 명단에서 지워도 영구히 관리자로 남는 결함이 통과한다 -
	 * 명단이 통제 수단이 되지 못한다.
	 */
	@Test
	void unlisted_account_is_demoted() {
		signup("demote-me@b.com");
		userRepository.promoteAdmins(List.of("demote-me@b.com"));
		assertThat(roleOf("demote-me@b.com")).isEqualTo("admin");

		userRepository.demoteAdminsNotIn(List.of("someone-else@b.com"));

		assertThat(roleOf("demote-me@b.com")).isEqualTo("user");
	}

	/** TC-ADMIN-003 : 대소문자가 달라도 승격된다 - 비교가 lower(email) 기준 */
	@Test
	void listed_account_matches_case_insensitively() {
		signup("mixed-case@b.com");

		userRepository.promoteAdmins(AdminRoleSynchronizer.parse("Mixed-Case@B.COM"));

		assertThat(roleOf("mixed-case@b.com")).isEqualTo("admin");
	}

	/** 명단을 통째로 비우면 전원이 user 로 내려온다 - "관리자를 없앤다"가 성립해야 함 */
	@Test
	void empty_list_demotes_everyone() {
		signup("wipe-me@b.com");
		userRepository.promoteAdmins(List.of("wipe-me@b.com"));
		assertThat(roleOf("wipe-me@b.com")).isEqualTo("admin");

		userRepository.demoteAdminsNotIn(List.of());

		assertThat(roleOf("wipe-me@b.com")).isEqualTo("user");
	}

	/**
	 * TC-ADMIN-004 : 명단에 있으나 아직 가입하지 않은 계정은, 가입 시점에 관리자가 된다.
	 *
	 * <p>기동 동기화는 이미 가입한 계정만 손대므로 이 경로가 없으면 명단에 미리 넣어 둔 사람이
	 * 가입해도 일반 사용자가 되고, 재기동해야만 관리자가 된다.
	 */
	@SuppressWarnings("rawtypes")
	@Test
	void listed_but_unregistered_becomes_admin_on_signup() {
		// 이 클래스의 명단(app.admin.emails)에 있는 주소로 지금 가입한다
		var res = rest.postForEntity("/api/auth/signup",
				java.util.Map.of("email", "boot-admin@b.com", "password", "password123", "name", "운영"),
				java.util.Map.class);

		assertThat(res.getStatusCode().is2xxSuccessful()).isTrue();
		assertThat(roleOf("boot-admin@b.com")).isEqualTo("admin");
	}

	/** 가입 응답과 /api/auth/me 가 role 을 실어야 프론트가 관리 메뉴 노출을 판단할 수 있다 */
	@SuppressWarnings("unchecked")
	@Test
	void me_response_carries_role() {
		String token = signup("role-visible@b.com");

		var me = rest.exchange("/api/auth/me", org.springframework.http.HttpMethod.GET,
				new org.springframework.http.HttpEntity<>(bearer(token)), java.util.Map.class);

		assertThat(me.getBody().get("role")).isEqualTo("user");
	}
}
