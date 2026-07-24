package com.ragchatbot.service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ragchatbot.domain.Attachment;
import com.ragchatbot.domain.Conversation;
import com.ragchatbot.error.ApiExceptions.NotFoundException;
import com.ragchatbot.mapper.AttachmentMapper;
import com.ragchatbot.mapper.CitationMapper;
import com.ragchatbot.mapper.ConversationMapper;
import com.ragchatbot.mapper.MessageMapper;
import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.storage.FileStorage;
import com.ragchatbot.web.dto.ConversationDtos.CitationResponse;
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
	private final CitationMapper citationMapper;
	private final FileStorage fileStorage;
	private final OpenAiService openAiService;

	public ConversationService(ConversationMapper conversationMapper, MessageMapper messageMapper,
			AttachmentMapper attachmentMapper, CitationMapper citationMapper, FileStorage fileStorage,
			OpenAiService openAiService) {
		this.conversationMapper = conversationMapper;
		this.messageMapper = messageMapper;
		this.attachmentMapper = attachmentMapper;
		this.citationMapper = citationMapper;
		this.fileStorage = fileStorage;
		this.openAiService = openAiService;
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

	/** 메시지 + 출처(AC-7 재조회 시 유지) */
	public List<MessageResponse> messages(UUID userId, UUID conversationId) {
		requireOwned(conversationId, userId);
		return messageMapper.listByConversation(conversationId).stream()
				.map(m -> new MessageResponse(m.id(), m.role(), m.content(), m.status(), m.createdAt(),
						citationMapper.findByMessage(m.id()).stream()
								.map(c -> new CitationResponse(c.seq(), c.sourceName(), c.snippet(), c.uri()))
								.toList()))
				.toList();
	}

	/** 대화 삭제 - 첨부 파일 + OpenAI 리소스 정리 후 DB cascade(AC-12). */
	@Transactional
	public void delete(UUID userId, UUID conversationId) {
		Conversation conversation = requireOwned(conversationId, userId);
		List<Attachment> attachments = attachmentMapper.findByConversation(conversationId);
		List<String> openaiFileIds = new ArrayList<>();
		for (Attachment a : attachments) {
			fileStorage.delete(a.storagePath());
			if (a.openaiFileId() != null) {
				openaiFileIds.add(a.openaiFileId());
			}
		}
		// OpenAI 파일/Vector Store 정리(AC-12). 목업은 호출 기록만
		openAiService.deleteResources(conversation.vectorStoreId(), openaiFileIds);
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
