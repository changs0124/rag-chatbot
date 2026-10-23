package com.ragchatbot.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.ragchatbot.entity.Conversation;

/**
 * 대화 매퍼. 소유권은 findByIdAndUser / deleteByIdAndUser 로 강제(P-3).
 */
@Mapper
public interface ConversationRepository {

	void insert(Conversation conversation);

	Optional<Conversation> findByIdAndUser(@Param("id") UUID id, @Param("userId") UUID userId);

	/** 조건부 삭제용 행 잠금(FOR UPDATE, #447) */
	Optional<UUID> lockByIdAndUser(@Param("id") UUID id, @Param("userId") UUID userId);

	/** 채팅 준비용 공유 잠금(FOR KEY SHARE, #447) */
	Optional<Conversation> lockSharedByIdAndUser(@Param("id") UUID id, @Param("userId") UUID userId);

	List<Conversation> listByUser(@Param("userId") UUID userId);

	int deleteByIdAndUser(@Param("id") UUID id, @Param("userId") UUID userId);

	int updateTitle(@Param("id") UUID id, @Param("userId") UUID userId, @Param("title") String title);

	/** 새 활동으로 updated_at 갱신(목록 정렬용) */
	int touch(@Param("id") UUID id, @Param("userId") UUID userId);
}
