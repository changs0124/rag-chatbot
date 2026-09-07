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
@TestPropertySource(properties = "app.admin.emails=root@rag.test,boot-admin@b.com")
class AdminRoleSyncFlowTest extends AbstractPgIntegrationTest {

	@Autowired
	private UserRepository userRepository;

	private String roleOf(String email) {
		return jdbc.queryForObject("select role from users where email = ?", String.class, email);
	}

	/** TC-ADMIN-001 : 명단에 있는 계정이 admin 으로 승격된다 */
	@Test
	void listed_account_is_promoted() {
		createUser("promote-me@b.com");
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
		createUser("demote-me@b.com");
		userRepository.promoteAdmins(List.of("demote-me@b.com"));
		assertThat(roleOf("demote-me@b.com")).isEqualTo("admin");

		userRepository.demoteAdminsNotIn(List.of("someone-else@b.com"));

		assertThat(roleOf("demote-me@b.com")).isEqualTo("user");
	}

	/** TC-ADMIN-003 : 대소문자가 달라도 승격된다 - 비교가 lower(email) 기준 */
	@Test
	void listed_account_matches_case_insensitively() {
		createUser("mixed-case@b.com");

		userRepository.promoteAdmins(AdminRoleSynchronizer.parse("Mixed-Case@B.COM"));

		assertThat(roleOf("mixed-case@b.com")).isEqualTo("admin");
	}

	/** 명단을 통째로 비우면 전원이 user 로 내려온다 - "관리자를 없앤다"가 성립해야 함 */
	@Test
	void empty_list_demotes_everyone() {
		createUser("wipe-me@b.com");
		userRepository.promoteAdmins(List.of("wipe-me@b.com"));
		assertThat(roleOf("wipe-me@b.com")).isEqualTo("admin");

		userRepository.demoteAdminsNotIn(List.of());

		assertThat(roleOf("wipe-me@b.com")).isEqualTo("user");
	}

	/**
	 * TC-ADMIN-004 : 명단에 있는 주소는 기동 러너가 <b>계정째로</b> 만들고 관리자로 둔다.
	 *
	 * <p>회원가입이 있던 시절에는 이 자리가 「명단에 있는 사람이 가입하면 관리자가 된다」였다.
	 * 가입이 사라지면 계정을 만드는 것은 관리자뿐인데, 그 첫 관리자가 없으면 아무도 아무것도 만들 수
	 * 없다. 그래서 러너가 만든다 - 이 케이스가 그 고리를 지킨다.
	 */
	@Test
	void listed_but_missing_account_is_created_as_admin() {
		// 이 클래스의 명단(app.admin.emails)에 있는 주소. 기동 시 러너가 이미 만들어 뒀어야 한다
		assertThat(roleOf("boot-admin@b.com")).isEqualTo("admin");
		assertThat(jdbc.queryForObject("select password_hash from users where email = ?", String.class,
				"boot-admin@b.com")).startsWith("$2");
	}

	/** 계정 발급으로 태어난 사용자도 /api/auth/me 가 role 을 실어야 프론트가 관리 메뉴 노출을 판단할 수 있다 */
	@SuppressWarnings("unchecked")
	@Test
	void me_response_carries_role() {
		String token = createUser("role-visible@b.com");

		var me = rest.exchange("/api/auth/me", org.springframework.http.HttpMethod.GET,
				new org.springframework.http.HttpEntity<>(bearer(token)), java.util.Map.class);

		assertThat(me.getBody().get("role")).isEqualTo("user");
	}
}
