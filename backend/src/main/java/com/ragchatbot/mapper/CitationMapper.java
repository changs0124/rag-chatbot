package com.ragchatbot.mapper;

import java.util.List;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.ragchatbot.domain.Citation;

@Mapper
public interface CitationMapper {

	void insert(Citation citation);

	List<Citation> findByMessage(@Param("messageId") UUID messageId);
}
