package com.ragchatbot.service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ragchatbot.domain.Attachment;
import com.ragchatbot.domain.Citation;
import com.ragchatbot.domain.Conversation;
import com.ragchatbot.domain.Message;
import com.ragchatbot.error.ApiExceptions.BadRequestException;
import com.ragchatbot.error.ApiExceptions.NotFoundException;
import com.ragchatbot.mapper.AttachmentMapper;
import com.ragchatbot.mapper.CitationMapper;
import com.ragchatbot.mapper.ConversationMapper;
import com.ragchatbot.mapper.MessageMapper;
import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.openai.OpenAiService.AttachmentRef;
import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.openai.OpenAiService.ChatInput;
import com.ragchatbot.web.dto.ChatDtos.ChatRequest;
import com.ragchatbot.web.dto.ChatDtos.ChatResponse;
import com.ragchatbot.web.dto.ConversationDtos.CitationResponse;

/**
 * 채팅 오케스트레이션(Phase 4, 비스트리밍). 소유권 검증 → 사용자 메시지 저장 → OpenAI(목업) →
 * 어시스턴트 메시지 + 출처 저장(P-6). Phase 5에서 onToken을 SSE로 연결하고 레이트리밋을 얹음.
 */
@Service
public class ChatService {

	private final ConversationMapper conversationMapper;
	private final MessageMapper messageMapper;
	private final AttachmentMapper attachmentMapper;
	private final CitationMapper citationMapper;
	private final OpenAiService openAiService;

	public ChatService(ConversationMapper conversationMapper, MessageMapper messageMapper,
			AttachmentMapper attachmentMapper, CitationMapper citationMapper, OpenAiService openAiService) {
		this.conversationMapper = conversationMapper;
		this.messageMapper = messageMapper;
		this.attachmentMapper = attachmentMapper;
		this.citationMapper = citationMapper;
		this.openAiService = openAiService;
	}

	@Transactional
	public ChatResponse chat(UUID userId, ChatRequest req) {
		Conversation conversation = conversationMapper.findByIdAndUser(req.conversationId(), userId)
				.orElseThrow(() -> new NotFoundException("대화 없음"));

		String message = req.message() == null ? "" : req.message().trim();
		List<UUID> attachmentIds = req.attachmentIds() == null ? List.of() : req.attachmentIds();
		if (message.isEmpty() && attachmentIds.isEmpty()) {
			throw new BadRequestException("메시지 또는 첨부가 필요함");
		}

		// 첨부 소유권 확인 + OpenAI 입력 참조 구성(비전/문서, AC-14)
		List<AttachmentRef> refs = new ArrayList<>();
		for (UUID attId : attachmentIds) {
			Attachment att = attachmentMapper.findByIdAndUser(attId, userId)
					.orElseThrow(() -> new NotFoundException("첨부 없음"));
			refs.add(new AttachmentRef(att.fileType(), att.storagePath(), att.openaiFileId()));
		}

		// 사용자 메시지 저장 + 첨부 연결
		UUID userMsgId = UUID.randomUUID();
		messageMapper.insert(new Message(userMsgId, conversation.id(), "user", message, "complete", null));
		for (UUID attId : attachmentIds) {
			attachmentMapper.linkToMessage(attId, userMsgId, userId);
		}

		// OpenAI(목업) 호출 - Phase 4는 onToken 무시하고 결과 사용, Phase 5에서 SSE 연결
		ChatCompletion completion = openAiService.streamChat(
				new ChatInput(message, refs, conversation.vectorStoreId()), token -> {
				});

		// 어시스턴트 메시지 + 출처 저장(P-6)
		UUID asstMsgId = UUID.randomUUID();
		messageMapper.insert(new Message(asstMsgId, conversation.id(), "assistant", completion.fullText(), "complete", null));
		List<CitationResponse> citations = new ArrayList<>();
		for (var c : completion.citations()) {
			citationMapper.insert(new Citation(UUID.randomUUID(), asstMsgId, c.seq(), c.sourceName(), c.snippet(),
					c.uri(), null));
			citations.add(new CitationResponse(c.seq(), c.sourceName(), c.snippet(), c.uri()));
		}

		conversationMapper.touch(conversation.id(), userId);
		return new ChatResponse(asstMsgId, completion.fullText(), completion.noSource(), citations);
	}
}
