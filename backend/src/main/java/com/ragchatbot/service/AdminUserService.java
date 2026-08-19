package com.ragchatbot.service;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.ragchatbot.domain.User;
import com.ragchatbot.error.ApiExceptions.BadRequestException;
import com.ragchatbot.error.ApiExceptions.NotFoundException;
import com.ragchatbot.mapper.UserMapper;
import com.ragchatbot.web.dto.AdminDtos.AdminUserResponse;

/**
 * 관리자에 의한 사용자 관리(FEAT-ADMIN-003 · REQ-AUTH-006).
 *
 * <p>이메일 발송 수단(SMTP)을 도입하지 않고 비밀번호 복구 경로를 만들기 위한 선택이다.
 * <b>감수하는 약점</b> : 임시 비밀번호 전달 경로가 제품 밖(사내 메신저 등)이라 그 구간은
 * 보증되지 않는다. 이메일 인증을 도입하면 이 기능은 대체된다.
 */
@Service
public class AdminUserService {

	/**
	 * 혼동하기 쉬운 글자를 뺀 문자 집합. 임시 비밀번호는 사람이 눈으로 읽어 옮기므로
	 * {@code 0/O} · {@code 1/l/I} 가 섞이면 "안 된다"는 문의가 그만큼 늘어난다.
	 */
	private static final String ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

	private static final int SEGMENTS = 3;
	private static final int SEGMENT_LENGTH = 4;

	private final UserMapper userMapper;
	private final PasswordEncoder passwordEncoder;
	private final SecureRandom random = new SecureRandom();

	public AdminUserService(UserMapper userMapper, PasswordEncoder passwordEncoder) {
		this.userMapper = userMapper;
		this.passwordEncoder = passwordEncoder;
	}

	public List<AdminUserResponse> list() {
		return userMapper.listAll().stream()
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
		User target = userMapper.findById(targetUserId)
				.orElseThrow(() -> new NotFoundException("사용자 없음"));

		String temporary = generate();
		String hash = passwordEncoder.encode(temporary);
		// 현재 초에 발급된 토큰까지 확실히 걸리도록 경계를 다음 초로 올림(위 설명 참고)
		OffsetDateTime changedAt = OffsetDateTime.now().truncatedTo(ChronoUnit.SECONDS).plusSeconds(1);
		userMapper.updatePasswordHash(target.id(), hash, changedAt);
		return temporary;
	}

	/** {@code Xk7m-Qp29-Vr4t} 꼴. 구분자를 넣는 이유는 사람이 옮겨 적을 때 자리를 잃지 않게 하려는 것 */
	private String generate() {
		StringBuilder sb = new StringBuilder();
		for (int s = 0; s < SEGMENTS; s++) {
			if (s > 0) {
				sb.append('-');
			}
			for (int i = 0; i < SEGMENT_LENGTH; i++) {
				sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
			}
		}
		return sb.toString();
	}
}
