package com.ragchatbot.repository;

import java.util.List;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.ragchatbot.entity.Citation;

@Mapper
public interface CitationRepository {

	void insert(Citation citation);

	/** 대화 전체의 출처를 한 번에 읽음(메시지별 조회로 돌면 메시지 수만큼 질의가 나감) */
	List<Citation> findByConversation(@Param("conversationId") UUID conversationId);
}
