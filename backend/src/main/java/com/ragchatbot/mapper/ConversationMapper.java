package com.ragchatbot.mapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.ragchatbot.domain.Conversation;

/**
 * 대화 매퍼. 소유권은 findByIdAndUser / deleteByIdAndUser 로 강제(P-3).
 */
@Mapper
public interface ConversationMapper {

	void insert(Conversation conversation);

	Optional<Conversation> findByIdAndUser(@Param("id") UUID id, @Param("userId") UUID userId);

	List<Conversation> listByUser(@Param("userId") UUID userId);

	int deleteByIdAndUser(@Param("id") UUID id, @Param("userId") UUID userId);
}
