package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.ragchatbot.config.EmailDomainPolicy;
import com.ragchatbot.entity.User;
import com.ragchatbot.exception.ApiExceptions.ConflictException;
import com.ragchatbot.repository.AttachmentRepository;
import com.ragchatbot.repository.UserRepository;
import com.ragchatbot.storage.FileStorage;

/**
 * 사용자 삭제의 409 변환은 업로더 외래 키 위반에만 건다(FEAT-ADMIN-004 · TC-ADMIN-092 · 093).
 *
 * <p><b>왜 단위 테스트인가</b> — 지금 스키마에는 users 를 restrict 로 가리키는 다른 표가 없어, 「다른 위반」을 통합 테스트로
 * 만들 수 없다. 저장소가 던지는 예외를 모킹으로 직접 만든다. 업로더 쪽의 실제 DB 메시지는 TC-ADMIN-087 이 본다.
 */
class AdminUserDeleteConstraintTest {

	private final UserRepository repo = mock(UserRepository.class);
	private final UUID target = UUID.randomUUID();

	private AdminUserService service() {
		when(repo.findById(target)).thenReturn(Optional.of(new User(target, "t@b.com", "h", "대상", "user", null, null)));
		return new AdminUserService(repo, mock(AttachmentRepository.class), mock(FileStorage.class),
				mock(PasswordEncoder.class), new TemporaryPasswordGenerator(), new EmailDomainPolicy("mock", "", ""), 50);
	}

	/** TC-ADMIN-092 : 업로더 외래 키 위반은 409 「문서를 올린 기록」 */
	@Test
	void uploader_fk_violation_becomes_conflict() {
		var service = service();
		when(repo.deleteById(any())).thenThrow(new DataIntegrityViolationException("delete",
				new SQLException("violates foreign key constraint \"" + AdminUserService.UPLOADER_FK + "\"")));

		assertThatThrownBy(() -> service.delete(target))
				.isInstanceOf(ConflictException.class)
				.hasMessage("문서를 올린 기록이 있는 사용자는 삭제할 수 없음");
	}

	/** TC-ADMIN-093 : 다른 제약 위반은 409 로 덮지 않고 그대로 던진다 - 이유를 잘못 말하지 않는다 */
	@Test
	void other_integrity_violation_is_rethrown() {
		var service = service();
		when(repo.deleteById(any())).thenThrow(new DataIntegrityViolationException("delete",
				new SQLException("violates foreign key constraint \"audit_logs_user_id_fkey\"")));

		assertThatThrownBy(() -> service.delete(target))
				.isInstanceOf(DataIntegrityViolationException.class);
	}
}
