package com.ragchatbot.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;

import org.springframework.beans.factory.annotation.Value;
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
import com.ragchatbot.openai.OpenAiService.Turn;
import com.ragchatbot.web.dto.ChatDtos.ChatRequest;

/**
 * 채팅 오케스트레이션(Phase 5, SSE).
 * prepare(동기) : 소유권/검증 + 사용자 메시지 저장 → 400/404를 정상 HTTP로 반환.
 * stream(비동기) : OpenAI(목업) 토큰을 SSE(meta→stage*→token*→citations→done)로 흘림(P-5).
 * 스트리밍 이후 영속화는 ChatPersistenceService에 위임(원자적 저장, 스트리밍 구간 비트랜잭션).
 */
@Service
public class ChatService {

	/** 과거 턴의 이미지 자리표시자 - 이미지를 다시 보내지 않아도 "그때 첨부가 있었다"는 사실은 남김 */
	static final String IMAGE_PLACEHOLDER = "(이미지 첨부)";

	private final ConversationMapper conversationMapper;
	private final MessageMapper messageMapper;
	private final AttachmentMapper attachmentMapper;
	private final OpenAiService openAiService;
	private final ChatPersistenceService chatPersistence;
	private final int historyTokenBudget;

	public ChatService(ConversationMapper conversationMapper, MessageMapper messageMapper,
			AttachmentMapper attachmentMapper, OpenAiService openAiService, ChatPersistenceService chatPersistence,
			@Value("${app.chat.history-token-budget:6000}") int historyTokenBudget) {
		this.conversationMapper = conversationMapper;
		this.messageMapper = messageMapper;
		this.attachmentMapper = attachmentMapper;
		this.openAiService = openAiService;
		this.chatPersistence = chatPersistence;
		this.historyTokenBudget = historyTokenBudget;
	}

	public record PreparedChat(UUID conversationId, String message, List<AttachmentRef> refs, String vectorStoreId,
			List<Turn> history) {
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

		// 이력은 **새 사용자 메시지를 넣기 전에** 읽음 - 넣고 읽으면 방금 보낸 것이 이력에 섞여 중복됨
		List<Turn> history = buildHistory(messageMapper.listByConversation(conversation.id()),
				messageIdsWithAttachments(conversation.id()), historyTokenBudget);

		UUID userMsgId = UUID.randomUUID();
		messageMapper.insert(new Message(userMsgId, conversation.id(), "user", message, "complete", false, null));
		for (UUID attId : attachmentIds) {
			attachmentMapper.linkToMessage(attId, userMsgId, userId);
		}
		return new PreparedChat(conversation.id(), message, refs, conversation.vectorStoreId(), history);
	}

	private Set<UUID> messageIdsWithAttachments(UUID conversationId) {
		Set<UUID> ids = new HashSet<>();
		for (Attachment a : attachmentMapper.findByConversation(conversationId)) {
			ids.add(a.messageId());
		}
		return ids;
	}

	/**
	 * 이력을 <b>토큰 예산</b> 안에서 최신부터 채운 뒤 시간순으로 돌려줌.
	 *
	 * <p>개수가 아니라 예산으로 자르는 이유 : 메시지 길이 편차가 커서 "최근 N개"는 비용을 예측하지 못함.
	 * "네" 한 글자도 1개고 3000자 붙여넣기도 1개라, 같은 N 이 어떤 대화에서는 수백 토큰이고
	 * 어떤 대화에서는 수만 토큰이 됨.
	 *
	 * <p>예산을 넘기면 <b>거기서 멈춤(break)</b> - 중간을 건너뛰고 더 오래된 것을 넣으면 대화가
	 * 끊긴 채로 전달돼 모델이 없는 맥락을 지어냄.
	 *
	 * <p>{@code status=error} 는 답변이 아니므로 제외함. 반대로 {@code stopped=true}(사용자가 중단)는
	 * 사용자가 실제로 화면에서 본 내용이라 포함함.
	 */
	static List<Turn> buildHistory(List<Message> messages, Set<UUID> withAttachments, int tokenBudget) {
		List<Turn> newestFirst = new ArrayList<>();
		int used = 0;
		for (int i = messages.size() - 1; i >= 0; i--) {
			Message m = messages.get(i);
			if ("error".equals(m.status())) {
				continue;
			}
			String text = historyText(m, withAttachments.contains(m.id()));
			if (text.isEmpty()) {
				continue;
			}
			int cost = estimateTokens(text);
			if (used + cost > tokenBudget) {
				break;
			}
			used += cost;
			newestFirst.add(new Turn(m.role(), text));
		}
		Collections.reverse(newestFirst);
		return List.copyOf(newestFirst);
	}

	private static String historyText(Message m, boolean hadAttachment) {
		String content = m.content() == null ? "" : m.content().trim();
		if (!hadAttachment) {
			return content;
		}
		// 이미지 자체는 다시 보내지 않음. 텍스트가 비어 있던 턴(이미지만 보낸 경우)도 흔적을 남겨야
		// 뒤 턴의 "그 사진"이 무엇을 가리키는지 모델이 알 수 있음
		return content.isEmpty() ? IMAGE_PLACEHOLDER : content + " " + IMAGE_PLACEHOLDER;
	}

	/**
	 * 토큰 수 근사. 정확한 토크나이저를 붙이지 않는 이유는 이 값이 <b>예산 가드</b>일 뿐 하드 한도가
	 * 아니기 때문임. 한국어 기준(문자 1.5개당 1토큰)이라 영어에서는 과대평가되는데, 과대평가는 이력이
	 * 짧아지는 방향이라 비용·컨텍스트 한도 어느 쪽으로도 안전한 쪽으로 틀림.
	 */
	private static int estimateTokens(String text) {
		return (int) Math.ceil(text.length() / 1.5);
	}

	/** 비동기 스트리밍 - SSE 이벤트 전송 + 어시스턴트 메시지/출처 저장(원자적) */
	public void stream(UUID userId, PreparedChat prepared, SseEmitter emitter) {
		UUID asstMsgId = UUID.randomUUID();
		StringBuilder buffer = new StringBuilder();
		// 첫 토큰 이후에는 단계를 보내지 않음(R-11 전송 규칙). 스트림 스레드 단독 사용이라 plain boolean으로 충분하지 않음 - 배열로 캡처
		boolean[] firstTokenSeen = { false };
		boolean saved = false;
		try {
			sendQuietly(emitter, "meta",
					Map.of("messageId", asstMsgId.toString(), "conversationId", prepared.conversationId().toString()));

			// 라벨은 구현이 소유하고(P-2) 발행만 여기서 함. analyzing은 meta 직후 = 스트림 개시 경계
			Consumer<Stage> onStage = stage -> {
				if (!firstTokenSeen[0]) {
					sendQuietly(emitter, "stage",
							Map.of("stage", stage.name().toLowerCase(Locale.ROOT), "label", openAiService.stageLabel(stage)));
				}
			};
			onStage.accept(Stage.ANALYZING);

			ChatCompletion completion = openAiService.streamChat(
					new ChatInput(prepared.message(), prepared.refs(), prepared.vectorStoreId(), prepared.history()),
					token -> {
						firstTokenSeen[0] = true;
						// 보낸 뒤에 담음 - 중단 시 저장분이 "화면에 닿은 만큼"과 같아짐(전송 실패한 토큰은 남기지 않음)
						sendQuietly(emitter, "token", Map.of("delta", token));
						buffer.append(token);
					}, onStage);

			// 어시스턴트 메시지 + 출처를 하나의 트랜잭션으로 저장(P-6)
			chatPersistence.saveAssistant(prepared.conversationId(), userId, asstMsgId, completion.fullText(),
					"complete", false, completion.citations());
			saved = true;

			List<Map<String, Object>> citationPayload = new ArrayList<>();
			for (var c : completion.citations()) {
				citationPayload.add(Map.of("seq", c.seq(), "sourceName", c.sourceName(),
						"snippet", c.snippet(), "uri", c.uri()));
			}
			sendQuietly(emitter, "citations", Map.of("items", citationPayload));
			sendQuietly(emitter, "done", Map.of("finishReason", "stop", "noSource", completion.noSource()));
			completeQuietly(emitter);
		} catch (ClientGoneException gone) {
			// AC-9 : 사용자가 정지했거나 연결이 끊긴 경우임. **실패가 아니므로** 받은 데까지 complete 로 저장함
			// (2026-07-28 결정 - 서버는 error, 프론트는 complete 로 서로 다르게 처리하던 것을 프론트 쪽으로 통일).
			// 부분 텍스트가 비면 저장하지 않음 - 빈 답변 버블을 남기면 화면(버블 제거)과 재조회가 어긋남.
			// stopped=true 로 남겨야 무자료 배너가 붙지 않음 - 인용은 스트림 끝에 오므로 여기서는 늘 0건임
			if (!saved) {
				savePartial(prepared, userId, asstMsgId, buffer.toString(), "complete", true);
			}
			completeQuietly(emitter);
		} catch (Exception ex) {
			// 진짜 오류 - 부분 텍스트를 error 상태로 저장(질문만 남고 답변 소실 방지)
			if (!saved) {
				savePartial(prepared, userId, asstMsgId, buffer.toString(), "error", false);
			}
			sendIgnoringFailure(emitter, "error", Map.of("code", "STREAM_ERROR", "message", "응답 생성 중 오류"));
			emitter.completeWithError(ex);
		}
	}

	/** 중단·오류 경로의 부분 저장. 중단인데 받은 것이 없으면 아무것도 남기지 않음 */
	private void savePartial(PreparedChat prepared, UUID userId, UUID asstMsgId, String text, String status,
			boolean stopped) {
		if (text.isEmpty() && "complete".equals(status)) {
			return;
		}
		try {
			chatPersistence.saveAssistant(prepared.conversationId(), userId, asstMsgId, text, status, stopped,
					List.of());
		} catch (Exception ignored) {
			// 저장 실패는 무시(이미 비정상 종료 경로)
		}
	}

	/** 전송 실패 = 클라이언트가 스트림을 끊음. 오류와 구분하려고 전용 예외로 올림 */
	private void sendQuietly(SseEmitter emitter, String event, Object data) {
		try {
			emitter.send(SseEmitter.event().name(event).data(data));
		} catch (Exception e) {
			throw new ClientGoneException(e);
		}
	}

	private void sendIgnoringFailure(SseEmitter emitter, String event, Object data) {
		try {
			emitter.send(SseEmitter.event().name(event).data(data));
		} catch (Exception ignored) {
			// 이미 끊긴 연결이면 보낼 곳이 없음
		}
	}

	private void completeQuietly(SseEmitter emitter) {
		try {
			emitter.complete();
		} catch (Exception ignored) {
			// 이미 끊긴 연결
		}
	}

	/** 클라이언트가 스트림을 끊음(정지 버튼·탭 종료·네트워크 절단) - 서버 실패가 아님 */
	static class ClientGoneException extends RuntimeException {
		ClientGoneException(Throwable cause) {
			super("SSE 전송 실패 - 클라이언트 연결 종료", cause);
		}
	}
}
