package com.ragchatbot.mapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.ragchatbot.domain.Attachment;

/**
 * 첨부 매퍼. 업로드 시점엔 message_id=null(고아). 소유권은 user_id 기준.
 */
@Mapper
public interface AttachmentMapper {

	void insert(Attachment attachment);

	Optional<Attachment> findByIdAndUser(@Param("id") UUID id, @Param("userId") UUID userId);

	/** 첨부를 메시지에 연결(채팅 전송 시). 소유자 것만 */
	int linkToMessage(@Param("id") UUID id, @Param("messageId") UUID messageId, @Param("userId") UUID userId);

	int deleteByIdAndUser(@Param("id") UUID id, @Param("userId") UUID userId);

	/** 대화에 속한 첨부(파일 삭제용 - 메시지 조인) */
	List<Attachment> findByConversation(@Param("conversationId") UUID conversationId);

	/** 고아 첨부 : message_id 가 null 이고 cutoff 이전에 만들어진 것 */
	List<Attachment> findOrphans(@Param("cutoff") OffsetDateTime cutoff);

	int deleteById(@Param("id") UUID id);

	/** 현재 행이 가리키는 저장 경로 전부 - 저장소 스캔 회수에서 "참조됨" 판정에 씀 */
	List<String> findAllStoragePaths();
}
