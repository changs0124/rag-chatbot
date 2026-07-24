package com.ragchatbot.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ragchatbot.domain.Attachment;
import com.ragchatbot.domain.Conversation;
import com.ragchatbot.error.ApiExceptions.NotFoundException;
import com.ragchatbot.mapper.AttachmentMapper;
import com.ragchatbot.mapper.ConversationMapper;
import com.ragchatbot.mapper.MessageMapper;
import com.ragchatbot.storage.FileStorage;
import com.ragchatbot.web.dto.ConversationDtos.ConversationResponse;
import com.ragchatbot.web.dto.ConversationDtos.MessageResponse;

/**
 * 대화 CRUD. 모든 접근은 requireOwned 를 통과함(P-3, AC-1). 남의 것은 404로 은닉.
 */
@Service
public class ConversationService {

	private final ConversationMapper conversationMapper;
	private final MessageMapper messageMapper;
	private final AttachmentMapper attachmentMapper;
	private final FileStorage fileStorage;

	public ConversationService(ConversationMapper conversationMapper, MessageMapper messageMapper,
			AttachmentMapper attachmentMapper, FileStorage fileStorage) {
		this.conversationMapper = conversationMapper;
		this.messageMapper = messageMapper;
		this.attachmentMapper = attachmentMapper;
		this.fileStorage = fileStorage;
	}

	public ConversationResponse create(UUID userId, String title) {
		UUID id = UUID.randomUUID();
		String finalTitle = (title == null || title.isBlank()) ? "새 대화" : title.trim();
		conversationMapper.insert(new Conversation(id, userId, finalTitle, null, null, null));
		return findOwnedResponse(id, userId);
	}

	public List<ConversationResponse> list(UUID userId) {
		return conversationMapper.listByUser(userId).stream()
				.map(c -> new ConversationResponse(c.id(), c.title(), c.createdAt(), c.updatedAt()))
				.toList();
	}

	public List<MessageResponse> messages(UUID userId, UUID conversationId) {
		requireOwned(conversationId, userId);
		return messageMapper.listByConversation(conversationId).stream()
				.map(m -> new MessageResponse(m.id(), m.role(), m.content(), m.status(), m.createdAt()))
				.toList();
	}

	/** 대화 삭제 - 첨부 파일을 먼저 지우고(외부 리소스), DB는 cascade로 정리(AC-12). */
	@Transactional
	public void delete(UUID userId, UUID conversationId) {
		requireOwned(conversationId, userId);
		for (Attachment a : attachmentMapper.findByConversation(conversationId)) {
			fileStorage.delete(a.storagePath());
			// TODO(Phase 4) : a.openaiFileId 가 있으면 OpenAiService.deleteVectorStore/파일 삭제 호출(AC-12)
		}
		conversationMapper.deleteByIdAndUser(conversationId, userId);
	}

	private Conversation requireOwned(UUID conversationId, UUID userId) {
		return conversationMapper.findByIdAndUser(conversationId, userId)
				.orElseThrow(() -> new NotFoundException("대화 없음"));
	}

	private ConversationResponse findOwnedResponse(UUID conversationId, UUID userId) {
		Conversation c = requireOwned(conversationId, userId);
		return new ConversationResponse(c.id(), c.title(), c.createdAt(), c.updatedAt());
	}
}
