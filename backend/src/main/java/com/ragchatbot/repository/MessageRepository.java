package com.ragchatbot.repository;

import java.util.List;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.ragchatbot.entity.Message;

/**
 * 메시지 매퍼. 소유권은 상위 대화 접근 시점에 검증(requireOwned).
 */
@Mapper
public interface MessageRepository {

	void insert(Message message);

	/** 사용자 메시지 한 행을 지운다(#489 질문 철회). 지운 행 수 */
	int deleteUserMessage(@Param("id") UUID id, @Param("conversationId") UUID conversationId);

	boolean existsByConversation(@Param("conversationId") UUID conversationId);

	List<Message> listByConversation(@Param("conversationId") UUID conversationId);
}
