package com.ragchatbot.mapper;

import java.util.Optional;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;

import com.ragchatbot.domain.User;

/**
 * 사용자 매퍼. SQL은 mapper/UserMapper.xml.
 */
@Mapper
public interface UserMapper {

	void insert(User user);

	Optional<User> findById(UUID id);

	Optional<User> findByEmail(String email);
}
