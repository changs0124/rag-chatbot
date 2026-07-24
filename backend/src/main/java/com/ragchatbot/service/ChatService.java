package com.ragchatbot.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

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

/**
 * 채팅 오케스트레이션(Phase 5, SSE).
 * prepare(동기) : 소유권/검증 + 사용자 메시지 저장 → 400/404를 정상 HTTP로 반환.
 * stream(비동기) : OpenAI(목업) 토큰을 SSE(meta→token→citations→done)로 흘리고 어시스턴트 저장(P-5·P-6).
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

	public record PreparedChat(UUID conversationId, String message, List<AttachmentRef> refs, String vectorStoreId) {
	}

	/** 동기 준비 - 소유권/검증 + 사용자 메시지 저장 + 첨부 연결 */
	@Transactional
	public PreparedChat prepare(UUID userId, ChatRequest req) {
		Conversation conversation = conversationMapper.findByIdAndUser(req.conversationId(), userId)
				.orElseThrow(() -> new NotFoundException("대화 없음"));

		String message = req.message() == null ? "" : req.message().trim();
		List<UUID> attachmentIds = req.attachmentIds() == null ? List.of() : req.attachmentIds();
		if (message.isEmpty() && attachmentIds.isEmpty()) {
			throw new BadRequestException("메시지 또는 첨부가 필요함"); // AC-21 : 첨부 있으면 허용
		}

		List<AttachmentRef> refs = new ArrayList<>();
		for (UUID attId : attachmentIds) {
			Attachment att = attachmentMapper.findByIdAndUser(attId, userId)
					.orElseThrow(() -> new NotFoundException("첨부 없음"));
			refs.add(new AttachmentRef(att.fileType(), att.storagePath(), att.openaiFileId()));
		}

		UUID userMsgId = UUID.randomUUID();
		messageMapper.insert(new Message(userMsgId, conversation.id(), "user", message, "complete", null));
		for (UUID attId : attachmentIds) {
			attachmentMapper.linkToMessage(attId, userMsgId, userId);
		}
		return new PreparedChat(conversation.id(), message, refs, conversation.vectorStoreId());
	}

	/** 비동기 스트리밍 - SSE 이벤트 전송 + 어시스턴트 메시지/출처 저장 */
	public void stream(UUID userId, PreparedChat prepared, SseEmitter emitter) {
		UUID asstMsgId = UUID.randomUUID();
		StringBuilder buffer = new StringBuilder();
		try {
			emitter.send(SseEmitter.event().name("meta")
					.data(Map.of("messageId", asstMsgId.toString(), "conversationId", prepared.conversationId().toString())));

			ChatCompletion completion = openAiService.streamChat(
					new ChatInput(prepared.message(), prepared.refs(), prepared.vectorStoreId()), token -> {
						buffer.append(token);
						sendQuietly(emitter, "token", Map.of("delta", token));
					});

			// 어시스턴트 메시지 + 출처 저장(P-6)
			messageMapper.insert(new Message(asstMsgId, prepared.conversationId(), "assistant",
					completion.fullText(), "complete", null));
			List<Map<String, Object>> citationPayload = new ArrayList<>();
			for (var c : completion.citations()) {
				citationMapper.insert(new Citation(UUID.randomUUID(), asstMsgId, c.seq(), c.sourceName(),
						c.snippet(), c.uri(), null));
				citationPayload.add(Map.of("seq", c.seq(), "sourceName", c.sourceName(),
						"snippet", c.snippet(), "uri", c.uri()));
			}
			conversationMapper.touch(prepared.conversationId(), userId);

			emitter.send(SseEmitter.event().name("citations").data(Map.of("items", citationPayload)));
			emitter.send(SseEmitter.event().name("done")
					.data(Map.of("finishReason", "stop", "noSource", completion.noSource())));
			emitter.complete();
		} catch (Exception ex) {
			// AC-9 : 중단/오류 시 부분 텍스트를 error 상태로 저장(질문만 남고 답변이 통째로 소실되는 것 방지)
			try {
				messageMapper.insert(new Message(asstMsgId, prepared.conversationId(), "assistant",
						buffer.toString(), "error", null));
			} catch (Exception ignored) {
				// 저장 실패는 무시(이미 오류 경로)
			}
			sendQuietly(emitter, "error", Map.of("code", "STREAM_ERROR", "message", "응답 생성 중 오류"));
			emitter.completeWithError(ex);
		}
	}

	private void sendQuietly(SseEmitter emitter, String event, Object data) {
		try {
			emitter.send(SseEmitter.event().name(event).data(data));
		} catch (Exception e) {
			throw new IllegalStateException("SSE 전송 실패", e);
		}
	}
}
