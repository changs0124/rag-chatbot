package com.ragchatbot.mapper;

import java.time.OffsetDateTime;
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
}
