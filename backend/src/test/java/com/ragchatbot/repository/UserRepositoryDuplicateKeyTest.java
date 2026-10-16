package com.ragchatbot.repository;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;

import com.ragchatbot.entity.User;
import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 이메일 중복 삽입이 실 DB 에서 {@link DuplicateKeyException} 으로 번역되는지(#327).
 *
 * <p>{@code AdminUserService.create} 의 409 변환은 이 번역에 기대고, 그 단위 테스트는 예외를 모킹으로
 * 만든다. 번역이 다른 예외로 바뀌면 단위 테스트는 초록인 채 동시 중복이 다시 500 이 되므로 여기서 잠근다.
 */
class UserRepositoryDuplicateKeyTest extends AbstractPgIntegrationTest {

	@Autowired
	private UserRepository userRepository;

	private static User user(String email) {
		return new User(UUID.randomUUID(), email, "hash", "사용자", "user", null, null);
	}

	@Test
	void duplicate_email_insert_is_translated_to_duplicate_key() {
		userRepository.insert(user("dupkey@b.com"));

		// 같은 주소 - users.email unique
		assertThatThrownBy(() -> userRepository.insert(user("dupkey@b.com")))
				.isInstanceOf(DuplicateKeyException.class);
		// 대소문자만 다른 주소 - idx_users_email_lower
		assertThatThrownBy(() -> userRepository.insert(user("DupKey@B.com")))
				.isInstanceOf(DuplicateKeyException.class);
	}
}
