package com.ragchatbot.service;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.ragchatbot.config.EmailDomainPolicy;
import com.ragchatbot.entity.User;
import com.ragchatbot.exception.ApiExceptions.BadRequestException;
import com.ragchatbot.exception.ApiExceptions.ConflictException;
import com.ragchatbot.exception.ApiExceptions.NotFoundException;
import com.ragchatbot.repository.AttachmentRepository;
import com.ragchatbot.repository.UserRepository;
import com.ragchatbot.storage.FileStorage;
import com.ragchatbot.dto.AdminDtos.AdminUserResponse;
import com.ragchatbot.dto.AdminDtos.CreateUserRequest;

/**
 * 관리자에 의한 사용자 관리(FEAT-ADMIN-003 · FEAT-ADMIN-004 · REQ-AUTH-006).
 *
 * <p>이메일 발송 수단(SMTP)을 도입하지 않고 비밀번호 복구 경로를 만들기 위한 선택이다.
 * <b>감수하는 약점</b> : 임시 비밀번호 전달 경로가 제품 밖(사내 메신저 등)이라 그 구간은
 * 보증되지 않는다. 이메일 인증을 도입하면 이 기능은 대체된다.
 */
@Service
public class AdminUserService {

	private static final Logger log = LoggerFactory.getLogger(AdminUserService.class);

	private final UserRepository userRepository;
	private final AttachmentRepository attachmentRepository;
	private final FileStorage fileStorage;
	private final PasswordEncoder passwordEncoder;
	private final TemporaryPasswordGenerator temporaryPasswords;
	private final EmailDomainPolicy emailDomainPolicy;
	private final int maxNameChars;

	public AdminUserService(UserRepository userRepository, AttachmentRepository attachmentRepository,
			FileStorage fileStorage, PasswordEncoder passwordEncoder,
			TemporaryPasswordGenerator temporaryPasswords, EmailDomainPolicy emailDomainPolicy,
			@Value("${app.user.max-name-chars}") int maxNameChars) {
		this.userRepository = userRepository;
		this.attachmentRepository = attachmentRepository;
		this.fileStorage = fileStorage;
		this.passwordEncoder = passwordEncoder;
		this.temporaryPasswords = temporaryPasswords;
		this.emailDomainPolicy = emailDomainPolicy;
		this.maxNameChars = maxNameChars;
	}

	/**
	 * 계정 발급(FEAT-AUTH-001). 임시 비밀번호를 만들어 <b>응답에 한 번만</b> 싣는다.
	 *
	 * <p>도메인 검사를 <b>중복 검사보다 먼저</b> 한다. 순서가 뒤집히면 허용되지 않는 주소에 대해
	 * "이미 있는 이메일"을 돌려주게 되어 계정 존재 여부가 샌다 - 로그인에서 계정 유무를 숨기는 것과 같은 결이다.
	 */
	public String create(CreateUserRequest req) {
		String email = EmailDomainPolicy.normalize(req.email());
		if (!emailDomainPolicy.isAllowed(email)) {
			throw new BadRequestException(emailDomainPolicy.rejectionMessage());
		}
		String name = ProfileService.requireNameLength(req.name().trim(), maxNameChars);
		userRepository.findByEmail(email).ifPresent(u -> {
			throw new ConflictException("이미 있는 이메일");
		});
		String temporary = temporaryPasswords.generate();
		// 명단에 있는 주소로 계정을 발급하면 곧바로 관리자여야 한다. 기동 동기화까지 기다리게 하면
		// 발급 직후 그 사람은 관리 화면에 못 들어가고, 이유는 화면 어디에도 적히지 않는다
		String role = emailDomainPolicy.isAdminEmail(email) ? "admin" : "user";
		try {
			userRepository.insert(new User(UUID.randomUUID(), email, passwordEncoder.encode(temporary),
					name, role, null, null));
		} catch (DuplicateKeyException e) {
			// users 의 업무 유니크 키가 email 하나뿐일 때만 맞는 변환이다 - 유니크 키를 더하면 여기서 갈라 볼 것
			// 위 조회와 이 삽입 사이(bcrypt 로 ~100ms)에 같은 주소가 먼저 들어간 경우. 유니크 인덱스가 막은 것을
			// 그대로 내보내면 500 이 된다 - 순차 중복과 같은 409 로 맞춘다(#327). 위 조회는 오류 순서 때문에 남긴다
			throw new ConflictException("이미 있는 이메일");
		}
		return temporary;
	}

	public List<AdminUserResponse> list() {
		return userRepository.listAll().stream()
				.map(u -> new AdminUserResponse(u.id(), u.email(), u.name(), u.role(), u.createdAt()))
				.toList();
	}

	/**
	 * 임시 비밀번호 발급. 평문은 <b>응답에 한 번만</b> 실리고 저장되지 않는다.
	 *
	 * <p>{@code password_changed_at} 을 함께 올려 기존 무효화 기준선 규칙을 그대로 탄다 -
	 * 초기화 즉시 그 사용자의 <b>모든 기존 토큰이 무효</b>가 된다. 계정 탈취 대응이 성립하려면 이래야 한다.
	 *
	 * <p><b>기준선을 다음 초로 올린다</b>(ProfileService 와 다른 점). JWT 의 {@code iat} 는 초 단위로
	 * 내림되므로, 본인 변경에서는 "같은 초에 발급된 직전 토큰 1개"가 살아남는 틈을 감수한다 -
	 * 그 토큰의 주인이 방금 비밀번호를 바꾼 본인이기 때문이다. <b>관리자 초기화에서는 그 전제가 깨진다</b> :
	 * 토큰 주인은 다른 사람이고, 그 세션을 끊는 것이 이 기능의 목적이다. 여기서는 살려 둘 토큰이
	 * 아예 없으므로 경계를 현재 초의 끝으로 밀어 틈을 없앤다.
	 */
	public String resetPassword(UUID adminId, UUID targetUserId) {
		if (adminId.equals(targetUserId)) {
			// 마이페이지에 비밀번호 변경이 이미 있고, 관리자가 자기 세션을 스스로 끊을 이유가 없다
			throw new BadRequestException("자기 자신은 초기화 대상이 아님 - 마이페이지에서 변경할 것");
		}
		User target = userRepository.findById(targetUserId)
				.orElseThrow(() -> new NotFoundException("사용자 없음"));

		String temporary = temporaryPasswords.generate();
		String hash = passwordEncoder.encode(temporary);
		// 현재 초에 발급된 토큰까지 확실히 걸리도록 경계를 다음 초로 올림(위 설명 참고)
		OffsetDateTime changedAt = OffsetDateTime.now().truncatedTo(ChronoUnit.SECONDS).plusSeconds(1);
		userRepository.updatePasswordHash(target.id(), hash, changedAt);
		return temporary;
	}

	/**
	 * 사용자 삭제(FEAT-ADMIN-004). 대화 · 메시지 · 인용 · 첨부 행은 외래 키 cascade 로 함께 지워진다.
	 *
	 * <p><b>관리자(자기 자신 포함)는 지우지 않는다</b> - 관리자는 {@code ADMIN_EMAILS} 명단으로만 정해지고,
	 * 명단에 남은 계정을 지우면 기동 동기화가 다시 만든다. 내리려면 명단에서 빼는 것이 유일한 길이다.
	 *
	 * <p><b>문서를 올린 기록이 있으면 409</b> - {@code rag_documents.uploaded_by} 가 {@code on delete restrict} 라
	 * 감사 기록(REQ-ADMIN-002)을 지키려고 DB 가 막는다. soft delete 된 문서 행도 남아 있으므로 함께 막힌다.
	 * 미리 조회하지 않고 삭제 문장의 외래 키 위반을 받는다 - 확인과 삭제 사이에 끼어들 틈이 없다.
	 *
	 * <p>순서는 대화 삭제({@link ConversationService#delete})와 같다 - <b>DB 를 먼저 지우고 파일은 그 뒤에</b>.
	 * cascade 삭제는 단일 문장이라 그 자체로 원자적이다. 파일 삭제 실패나, 경로를 읽은 뒤 삭제 전에 올라온 첨부의
	 * 파일은 가리키는 행이 없으므로 저장소 스캔 회수({@link FileService#cleanupUnreferencedFiles})가 거둔다.
	 * 남은 토큰은 {@code JwtAuthenticationFilter} 가 기준선(없는 사용자)으로 거른다 - 다음 요청부터 401.
	 */
	public void delete(UUID targetUserId) {
		User target = userRepository.findById(targetUserId)
				.orElseThrow(() -> new NotFoundException("사용자 없음"));
		if ("admin".equals(target.role())) {
			throw new BadRequestException("관리자 계정은 삭제 대상이 아님 - ADMIN_EMAILS 명단에서 빼면 일반 사용자가 됨");
		}
		List<String> paths = attachmentRepository.findStoragePathsByUser(targetUserId);

		try {
			userRepository.deleteById(targetUserId); // cascade - 단일 문장
		} catch (DataIntegrityViolationException e) {
			// users 를 restrict 로 가리키는 것이 rag_documents.uploaded_by 하나뿐일 때만 맞는 변환이다
			throw new ConflictException("문서를 올린 기록이 있는 사용자는 삭제할 수 없음");
		}

		for (String path : paths) {
			try {
				fileStorage.delete(path);
			} catch (RuntimeException e) {
				log.warn("사용자 삭제 후 첨부 파일 정리 실패 - 저장소 스캔 회수가 다음 주기에 지움. path={}", path, e);
			}
		}
	}
}
