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

	List<Message> listByConversation(@Param("conversationId") UUID conversationId);
}
