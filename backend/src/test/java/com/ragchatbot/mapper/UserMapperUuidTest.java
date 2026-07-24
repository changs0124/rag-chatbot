package com.ragchatbot.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.ragchatbot.domain.User;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * Phase 1 : MyBatis + PostgreSQL uuid 왕복 스파이크(M7) + 마이그레이션 검증(AC-20).
 * 실 PostgreSQL(Testcontainers, 공유 싱글턴)에 Flyway가 스키마를 적용한 뒤 검사함.
 */
class UserMapperUuidTest extends AbstractPgIntegrationTest {

	@Autowired
	private UserMapper userMapper;

	@Test
	void uuid_insert_select_roundtrip() {
		UUID id = UUID.randomUUID();
		userMapper.insert(new User(id, "uuidtest@b.com", "hash", "홍길동", "system", null, null));

		User found = userMapper.findById(id).orElseThrow();
		assertThat(found.id()).isEqualTo(id);
		assertThat(found.email()).isEqualTo("uuidtest@b.com");
		assertThat(found.name()).isEqualTo("홍길동");
		assertThat(found.theme()).isEqualTo("system");
		assertThat(found.createdAt()).isNotNull(); // DB default now()
	}

	@Test
	void migration_creates_five_tables() {
		Integer count = jdbc.queryForObject(
				"select count(*) from information_schema.tables "
						+ "where table_schema = 'public' "
						+ "and table_name in ('users','conversations','messages','citations','attachments')",
				Integer.class);
		assertThat(count).isEqualTo(5);
	}
}
