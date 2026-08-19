package com.ragchatbot.mapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.ragchatbot.domain.User;

/**
 * 사용자 매퍼. SQL은 mapper/UserMapper.xml.
 */
@Mapper
public interface UserMapper {

	void insert(User user);

	Optional<User> findById(UUID id);

	Optional<User> findByEmail(String email);

	void updateName(@Param("id") UUID id, @Param("name") String name);

	/**
	 * 비밀번호 해시 + 무효화 기준선을 함께 씀.
	 * 기준선을 <b>호출자가 넘김</b> - DB의 {@code now()}를 쓰면 기준선은 DB 시계, 직후 발급되는 JWT의
	 * {@code iat}는 앱 시계라 두 시계가 갈릴 때 새 토큰이 발급 즉시 무효가 됨(재리뷰 라운드 2 N-2).
	 */
	void updatePasswordHash(@Param("id") UUID id, @Param("passwordHash") String passwordHash,
			@Param("changedAt") OffsetDateTime changedAt);

	/** 비밀번호 변경 시각 - 이 시각 이전에 발급된 JWT를 거르는 기준선. 없는 사용자면 null */
	OffsetDateTime findPasswordChangedAt(UUID id);

	void updateTheme(@Param("id") UUID id, @Param("theme") String theme);

	/**
	 * 명단에 없는 관리자를 일반 사용자로 내림(FEAT-ADMIN-001).
	 *
	 * <p><b>강등이 없으면 명단이 통제 수단이 되지 못함</b> - 한 번 관리자가 된 계정이 명단에서
	 * 지워도 영구히 남음. 명단이 비면 전원 강등이며 그것이 맞는 동작임("관리자를 없앤다").
	 * 이메일은 <b>소문자로 정규화해서</b> 넘길 것(비교가 lower(email) 기준임).
	 *
	 * @return 강등된 행 수
	 */
	int demoteAdminsNotIn(@Param("emails") List<String> emails);

	/**
	 * 명단에 있는 일반 사용자를 관리자로 올림(FEAT-ADMIN-001).
	 * 명단이 비어 있으면 호출하지 말 것 - {@code in ()} 은 유효한 SQL 이 아님.
	 *
	 * @return 승격된 행 수
	 */
	int promoteAdmins(@Param("emails") List<String> emails);
}
