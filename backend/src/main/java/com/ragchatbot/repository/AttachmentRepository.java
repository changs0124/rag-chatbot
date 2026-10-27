package com.ragchatbot.repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.ragchatbot.entity.Attachment;

/**
 * 첨부 매퍼. 업로드 시점엔 message_id=null(고아). 소유권은 user_id 기준.
 */
@Mapper
public interface AttachmentRepository {

	void insert(Attachment attachment);

	Optional<Attachment> findByIdAndUser(@Param("id") UUID id, @Param("userId") UUID userId);

	/** 첨부를 메시지에 연결(채팅 전송 시). 소유자 것만 */
	int linkToMessage(@Param("id") UUID id, @Param("messageId") UUID messageId, @Param("userId") UUID userId);

	/** 메시지에 붙은 첨부를 보내기 전 상태(message_id 없음)로 되돌린다(#489 질문 철회). 바꾼 행 수 */
	int unlinkFromMessage(@Param("messageId") UUID messageId);

	/** 보내기 전(message_id 없음) 첨부만 지운다(#249). 지운 행 수 */
	int deleteDraftByIdAndUser(@Param("id") UUID id, @Param("userId") UUID userId);

	/** 대화에 속한 첨부(메시지 조인). 호출처 : 대화 메시지 조회 · 대화 삭제의 파일 삭제(ConversationService) · 채팅 전송 시 첨부 있는 메시지 판별(ChatService) */
	List<Attachment> findByConversation(@Param("conversationId") UUID conversationId);

	/** 고아 첨부 : message_id 가 null 이고 cutoff 이전에 만들어진 것 */
	List<Attachment> findOrphans(@Param("cutoff") OffsetDateTime cutoff);

	/** 그 사용자의 첨부 저장 경로 전부 - 사용자 삭제(FEAT-ADMIN-004)가 cascade 전에 읽어 두고 커밋 뒤 파일을 지움 */
	List<String> findStoragePathsByUser(@Param("userId") UUID userId);

	/** 현재 행이 가리키는 저장 경로 전부 - 저장소 스캔 회수에서 "참조됨" 판정에 씀 */
	List<String> findAllStoragePaths();
}
