package com.ragchatbot.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;

/**
 * 앱은 슈퍼유저가 아닌 런타임 계정으로 접속한다(#415).
 *
 * <p>슈퍼유저로 접속하면 SQL 주입이 한 곳만 생겨도 {@code COPY ... TO PROGRAM} 으로 db 컨테이너에서 명령을 돌리고
 * 모든 권한을 가진다. 런타임 계정은 테이블 DML 만 하고 스키마 · 마이그레이션 이력은 건드리지 못해야 한다.
 */
class RuntimeRolePrivilegeTest extends AbstractPgIntegrationTest {

	@Test
	void app_connects_as_runtime_role_without_superuser() {
		assertThat(jdbc.queryForObject("select current_user", String.class)).isEqualTo(RUNTIME_USER);
		assertThat(jdbc.queryForObject("select rolsuper from pg_roles where rolname = current_user", Boolean.class))
				.isFalse();
	}

	@Test
	void runtime_role_has_dml_on_app_tables() {
		assertThat(jdbc.queryForObject(
				"select bool_and(has_table_privilege(current_user, c.oid, 'SELECT,INSERT,UPDATE,DELETE'))"
						+ " from pg_class c join pg_namespace n on n.oid = c.relnamespace"
						+ " where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'flyway_schema_history'",
				Boolean.class)).isTrue();
	}

	@Test
	void runtime_role_cannot_change_schema_history_or_run_programs() {
		assertThatThrownBy(() -> jdbc.execute("create table runtime_probe(id int)"))
				.isInstanceOf(DataAccessException.class);
		assertThatThrownBy(() -> jdbc.update("delete from flyway_schema_history"))
				.isInstanceOf(DataAccessException.class);
		assertThatThrownBy(() -> jdbc.execute("copy (select 1) to program 'true'"))
				.isInstanceOf(DataAccessException.class);
	}
}
