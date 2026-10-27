package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.ragchatbot.config.EmailDomainPolicy;
import com.ragchatbot.dto.AdminDtos.CreateUserRequest;
import com.ragchatbot.exception.ApiExceptions.ConflictException;
import com.ragchatbot.repository.AttachmentRepository;
import com.ragchatbot.repository.UserRepository;
import com.ragchatbot.storage.FileStorage;

/**
 * 동시 중복 발급(#327). 사전 조회와 삽입 사이(bcrypt 로 ~100ms)에 같은 이메일이 먼저 들어가면
 * 유니크 인덱스가 막는데, 그 예외가 그대로 나가면 범용 처리기가 <b>500</b> 을 만든다.
 *
 * <p><b>왜 단위 테스트인가</b> — 통합 테스트로는 두 요청이 조회를 함께 통과하는 순간을 결정적으로
 * 만들 수 없다. 조회는 비고 삽입만 걸리는 상태를 모킹으로 직접 만든다.
 */
class AdminUserCreateRaceTest {

	/** 경쟁에서 진 쪽도 순차 중복과 같은 409 「이미 있는 이메일」을 받는다 */
	@Test
	void duplicate_key_on_insert_becomes_conflict() {
		UserRepository repo = mock(UserRepository.class);
		when(repo.findByEmail(anyString())).thenReturn(Optional.empty());
		doThrow(new DuplicateKeyException("idx_users_email_lower")).when(repo).insert(any());
		PasswordEncoder encoder = mock(PasswordEncoder.class);
		when(encoder.encode(anyString())).thenReturn("hash");

		var service = new AdminUserService(repo, mock(AttachmentRepository.class), mock(FileStorage.class), encoder,
				new TemporaryPasswordGenerator(),
				new EmailDomainPolicy("mock", "", ""), 50);

		assertThatThrownBy(() -> service.create(new CreateUserRequest("race@b.com", "사용자")))
				.isInstanceOf(ConflictException.class)
				.hasMessage("이미 있는 이메일");
	}
}
