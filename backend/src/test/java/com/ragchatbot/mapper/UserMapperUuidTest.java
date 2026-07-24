package com.ragchatbot.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.ragchatbot.domain.User;

/**
 * Phase 1 : MyBatis + PostgreSQL uuid 왕복 스파이크(M7) + 마이그레이션 검증(AC-20).
 * 실 PostgreSQL(Testcontainers)에 Flyway가 스키마를 적용한 뒤 검사함. Docker 필요.
 */
@SpringBootTest
@Testcontainers
class UserMapperUuidTest {

	@Container
	@ServiceConnection
	static PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired
	private UserMapper userMapper;

	@Autowired
	private JdbcTemplate jdbc;

	@Test
	void uuid_insert_select_roundtrip() {
		UUID id = UUID.randomUUID();
		userMapper.insert(new User(id, "a@b.com", "hash", "홍길동", "system", null, null));

		User found = userMapper.findById(id).orElseThrow();
		assertThat(found.id()).isEqualTo(id);
		assertThat(found.email()).isEqualTo("a@b.com");
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
