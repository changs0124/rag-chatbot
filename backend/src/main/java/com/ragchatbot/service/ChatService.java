package com.ragchatbot.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.ragchatbot.domain.Attachment;
import com.ragchatbot.domain.Conversation;
import com.ragchatbot.domain.Message;
import com.ragchatbot.error.ApiExceptions.BadRequestException;
import com.ragchatbot.error.ApiExceptions.NotFoundException;
import com.ragchatbot.mapper.AttachmentMapper;
import com.ragchatbot.mapper.ConversationMapper;
import com.ragchatbot.mapper.MessageMapper;
import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.openai.OpenAiService.AttachmentRef;
import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.openai.OpenAiService.ChatInput;
import com.ragchatbot.openai.OpenAiService.Stage;
import com.ragchatbot.web.dto.ChatDtos.ChatRequest;

/**
 * 채팅 오케스트레이션(Phase 5, SSE).
 * prepare(동기) : 소유권/검증 + 사용자 메시지 저장 → 400/404를 정상 HTTP로 반환.
 * stream(비동기) : OpenAI(목업) 토큰을 SSE(meta→stage*→token*→citations→done)로 흘림(P-5).
 * 스트리밍 이후 영속화는 ChatPersistenceService에 위임(원자적 저장, 스트리밍 구간 비트랜잭션).
 */
@Service
public class ChatService {

	private final ConversationMapper conversationMapper;
	private final MessageMapper messageMapper;
	private final AttachmentMapper attachmentMapper;
	private final OpenAiService openAiService;
	private final ChatPersistenceService chatPersistence;

	public ChatService(ConversationMapper conversationMapper, MessageMapper messageMapper,
			AttachmentMapper attachmentMapper, OpenAiService openAiService, ChatPersistenceService chatPersistence) {
		this.conversationMapper = conversationMapper;
		this.messageMapper = messageMapper;
		this.attachmentMapper = attachmentMapper;
		this.openAiService = openAiService;
		this.chatPersistence = chatPersistence;
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

	/** 비동기 스트리밍 - SSE 이벤트 전송 + 어시스턴트 메시지/출처 저장(원자적) */
	public void stream(UUID userId, PreparedChat prepared, SseEmitter emitter) {
		UUID asstMsgId = UUID.randomUUID();
		StringBuilder buffer = new StringBuilder();
		// 첫 토큰 이후에는 단계를 보내지 않음(R-11 전송 규칙). 스트림 스레드 단독 사용이라 plain boolean으로 충분하지 않음 - 배열로 캡처
		boolean[] firstTokenSeen = { false };
		try {
			emitter.send(SseEmitter.event().name("meta")
					.data(Map.of("messageId", asstMsgId.toString(), "conversationId", prepared.conversationId().toString())));

			// 라벨은 구현이 소유하고(P-2) 발행만 여기서 함. analyzing은 meta 직후 = 스트림 개시 경계
			Consumer<Stage> onStage = stage -> {
				if (!firstTokenSeen[0]) {
					sendQuietly(emitter, "stage",
							Map.of("stage", stage.name().toLowerCase(Locale.ROOT), "label", openAiService.stageLabel(stage)));
				}
			};
			onStage.accept(Stage.ANALYZING);

			ChatCompletion completion = openAiService.streamChat(
					new ChatInput(prepared.message(), prepared.refs(), prepared.vectorStoreId()), token -> {
						firstTokenSeen[0] = true;
						buffer.append(token);
						sendQuietly(emitter, "token", Map.of("delta", token));
					}, onStage);

			// 어시스턴트 메시지 + 출처를 하나의 트랜잭션으로 저장(P-6)
			chatPersistence.saveAssistant(prepared.conversationId(), userId, asstMsgId, completion.fullText(),
					"complete", completion.citations());

			List<Map<String, Object>> citationPayload = new ArrayList<>();
			for (var c : completion.citations()) {
				citationPayload.add(Map.of("seq", c.seq(), "sourceName", c.sourceName(),
						"snippet", c.snippet(), "uri", c.uri()));
			}
			emitter.send(SseEmitter.event().name("citations").data(Map.of("items", citationPayload)));
			emitter.send(SseEmitter.event().name("done")
					.data(Map.of("finishReason", "stop", "noSource", completion.noSource())));
			emitter.complete();
		} catch (Exception ex) {
			// AC-9 : 중단/오류 시 부분 텍스트를 error 상태로 저장(질문만 남고 답변 소실 방지)
			try {
				chatPersistence.saveAssistant(prepared.conversationId(), userId, asstMsgId, buffer.toString(),
						"error", List.of());
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
