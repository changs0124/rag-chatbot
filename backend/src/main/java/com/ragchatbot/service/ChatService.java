package com.ragchatbot.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.ragchatbot.entity.Attachment;
import com.ragchatbot.entity.Conversation;
import com.ragchatbot.entity.Message;
import com.ragchatbot.exception.ApiExceptions.BadRequestException;
import com.ragchatbot.exception.ApiExceptions.NotFoundException;
import com.ragchatbot.repository.AttachmentRepository;
import com.ragchatbot.repository.ConversationRepository;
import com.ragchatbot.repository.MessageRepository;
import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.openai.OpenAiService.AttachmentRef;
import com.ragchatbot.openai.OpenAiService.ChatCompletion;
import com.ragchatbot.openai.OpenAiService.ChatInput;
import com.ragchatbot.openai.OpenAiService.Stage;
import com.ragchatbot.openai.OpenAiService.Turn;
import com.ragchatbot.dto.ChatDtos.ChatRequest;

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

	private final ConversationRepository conversationRepository;
	private final MessageRepository messageRepository;
	private final AttachmentRepository attachmentRepository;
	private final OpenAiService openAiService;
	private final ChatPersistenceService chatPersistence;
	private final int historyTokenBudget;

	public ChatService(ConversationRepository conversationRepository, MessageRepository messageRepository,
			AttachmentRepository attachmentRepository, OpenAiService openAiService, ChatPersistenceService chatPersistence,
			@Value("${app.chat.history-token-budget:6000}") int historyTokenBudget) {
		this.conversationRepository = conversationRepository;
		this.messageRepository = messageRepository;
		this.attachmentRepository = attachmentRepository;
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
		Conversation conversation = conversationRepository.findByIdAndUser(req.conversationId(), userId)
				.orElseThrow(() -> new NotFoundException("대화 없음"));

		String message = req.message() == null ? "" : req.message().trim();
		List<UUID> attachmentIds = req.attachmentIds() == null ? List.of() : req.attachmentIds();
		if (message.isEmpty() && attachmentIds.isEmpty()) {
			throw new BadRequestException("메시지 또는 첨부가 필요함"); // AC-21 : 첨부 있으면 허용
		}

		// **같은 id 를 두 번 넣으면 이미지가 두 번 인코딩돼 나간다**(#99). 중복은 조용히 접는다 -
		// 사용자가 의도한 것이 아니고, 거절하면 화면이 고칠 수 없는 오류를 보게 된다
		List<UUID> distinctIds = attachmentIds.stream().distinct().toList();
		List<AttachmentRef> refs = new ArrayList<>();
		for (UUID attId : distinctIds) {
			Attachment att = attachmentRepository.findByIdAndUser(attId, userId)
					.orElseThrow(() -> new NotFoundException("첨부 없음"));
			// **이미 다른 메시지에 붙은 첨부는 여기서 거절한다**(#99). 종전에는 소유권만 보고 통과시켜
			// refs 에 담았는데, linkToMessage 의 SQL 에는 `message_id is null` 조건이 있어 0행을 갱신했다.
			// 그 결과 이미지가 base64 로 모델에 다시 전송돼 **비용은 나가고 저장은 안 됐다** -
			// 새로고침하면 그 메시지에 이미지가 없고, historyText 의 자리표시자도 안 붙어 이후 턴에서
			// 「그 사진」의 지시 대상이 모델 입력에서 사라졌다.
			//
			// **모델 호출 전에 걸러야 한다** - 뒤에서 잡으면 비용이 이미 나간 뒤다
			if (att.messageId() != null) {
				throw new BadRequestException("이미 보낸 첨부는 다시 사용할 수 없음");
			}
			refs.add(new AttachmentRef(att.fileType(), att.storagePath(), att.openaiFileId()));
		}

		// 이력은 **새 사용자 메시지를 넣기 전에** 읽음 - 넣고 읽으면 방금 보낸 것이 이력에 섞여 중복됨
		List<Turn> history = buildHistory(messageRepository.listByConversation(conversation.id()),
				messageIdsWithAttachments(conversation.id()), historyTokenBudget);

		UUID userMsgId = UUID.randomUUID();
		// 사용자 메시지에는 사용량이라는 개념이 없음 - null(FEAT-OPS-001)
		messageRepository.insert(new Message(userMsgId, conversation.id(), "user", message, "complete", false,
				false, null, null, null));
		for (UUID attId : distinctIds) {
			attachmentRepository.linkToMessage(attId, userMsgId, userId);
		}
		return new PreparedChat(conversation.id(), message, refs, conversation.vectorStoreId(), history);
	}

	private Set<UUID> messageIdsWithAttachments(UUID conversationId) {
		Set<UUID> ids = new HashSet<>();
		for (Attachment a : attachmentRepository.findByConversation(conversationId)) {
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
	 *
	 * <p><b>단, 타임아웃으로 끊긴 것은 제외함</b>(#84). {@code timedOut && stopped} 는 서버가 스트림을
	 * 닫아 문장이 잘린 경우인데, 사용자는 그것을 본 적도 받아들인 적도 없음 - 화면에는 그 시점까지의
	 * 토큰만 떠 있고 「잘렸다」는 표시조차 없음. 포함하면 모델이 자기가 쓰다 만 문장을 대화의
	 * 확정된 맥락으로 읽음. {@code timedOut && !stopped}(갈래 ②)는 전문이 저장됐으므로 포함하고,
	 * 갈래 ③은 {@code error} 라 위 규칙에 이미 걸림.
	 */
	static List<Turn> buildHistory(List<Message> messages, Set<UUID> withAttachments, int tokenBudget) {
		List<Turn> newestFirst = new ArrayList<>();
		int used = 0;
		for (int i = messages.size() - 1; i >= 0; i--) {
			Message m = messages.get(i);
			if ("error".equals(m.status())) {
				continue;
			}
			// 서버 타임아웃으로 잘린 문장 - 사용자가 보지도 받아들이지도 않았음(#84)
			if (m.timedOut() && m.stopped()) {
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
		// 타임아웃 사실을 저장에 남기기 위한 표시(#84). **컨테이너 스레드가 세우고 스트림 스레드가
		// 읽으므로 AtomicBoolean 이어야 함** - 두 스레드 사이라 배열 캡처로는 가시성이 보장되지 않음.
		//
		// 이 리스너는 스트림을 끊지 못한다. emitter 는 이미 닫혀 있고(DefaultCallback.run 이 complete
		// 를 먼저 세움) 워커의 블로킹 read 는 인터럽트로 깨지지 않는다 - 자원 반납 문제는 #76 소관임.
		// 여기서 하는 일은 **무슨 일이 일어났는지 기록에 남기는 것** 하나뿐이다
		AtomicBoolean timedOut = new AtomicBoolean(false);
		emitter.onTimeout(() -> timedOut.set(true));
		// **catch 에서도 봐야 함**(#97). 스트림이 완주한 뒤 저장이 실패하면 인용과 사용량이 이미
		// 손에 있는데, 여기 없으면 재시도가 그것을 버리고 빈 값으로 덮어쓴다
		ChatCompletion completion = null;
		try {
			sendQuietly(emitter, "meta",
					Map.of("messageId", asstMsgId.toString(), "conversationId", prepared.conversationId().toString()));

			// 라벨은 구현이 소유하고(P-2) 발행만 여기서 함. analyzing은 meta 직후 = 스트림 개시 경계
			// sources는 그 단계가 실제로 참조한 자료명 - 여기서 만들지 않고 구현이 준 것을 그대로 넘김(P-2)
			BiConsumer<Stage, List<String>> onStage = (stage, sources) -> {
				if (!firstTokenSeen[0]) {
					sendQuietly(emitter, "stage", Map.of("stage", stage.name().toLowerCase(Locale.ROOT),
							"label", openAiService.stageLabel(stage, sources)));
				}
			};
			onStage.accept(Stage.ANALYZING, List.of());

			completion = openAiService.streamChat(
					new ChatInput(prepared.message(), prepared.refs(), prepared.vectorStoreId(), prepared.history()),
					token -> {
						firstTokenSeen[0] = true;
						// 보낸 뒤에 담음 - 중단 시 저장분이 "화면에 닿은 만큼"과 같아짐(전송 실패한 토큰은 남기지 않음)
						sendQuietly(emitter, "token", Map.of("delta", token));
						buffer.append(token);
					}, onStage);

			// 어시스턴트 메시지 + 출처를 하나의 트랜잭션으로 저장(P-6)
			// timedOut 이 참일 수 있음 - 워커가 대기 중 emitter 가 닫혔고 업스트림이 뒤늦게 응답한
			// 갈래 ②임. 텍스트는 전문이므로 stopped 는 false 지만, 화면은 끊긴 채라 그 사실을 남김
			chatPersistence.saveAssistant(prepared.conversationId(), userId, asstMsgId, completion.fullText(),
					"complete", false, timedOut.get(), completion.citations(), completion.inputTokens(),
					completion.outputTokens());
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
				savePartial(prepared, userId, asstMsgId, buffer.toString(), "complete", true, timedOut.get(), null);
			}
			completeQuietly(emitter);
		} catch (Exception ex) {
			// 진짜 오류 - 부분 텍스트를 error 상태로 저장(질문만 남고 답변 소실 방지).
			//
			// **completion 이 있으면 그것을 그대로 넘긴다**(#97). 스트림이 완주한 뒤 저장이 실패한
			// 경로가 여기로 오는데(saveAssistant 가 던짐), 그 시점에는 인용과 사용량을 **이미 알고
			// 있다.** 종전에는 빈 값으로 덮어써 재조회 시 본문에는 각주 [1][2] 가 남았는데 출처
			// 목록만 비어 있었고, 사용량 합계도 조용히 낮아졌다 - 「모르면 null」(FEAT-OPS-001)의
			// 취지와 반대로 **알고 있는 값을 버린 것**이다. 중단 경로는 정말로 모르므로 null 이 맞다.
			//
			// status 는 error 로 둔다. 저장이 실제로 한 번 실패했고, 화면에도 error 이벤트가 나가므로
			// complete 로 두면 화면(오류)과 재조회(정상)가 갈린다 - 이 저장소가 반복해 고쳐 온 모양이다
			if (!saved) {
				savePartial(prepared, userId, asstMsgId, buffer.toString(), "error", false, timedOut.get(),
						completion);
			}
			sendIgnoringFailure(emitter, "error", Map.of("code", "STREAM_ERROR", "message", "응답 생성 중 오류"));
			emitter.completeWithError(ex);
		}
	}

	/**
	 * 중단·오류 경로의 부분 저장. 중단인데 받은 것이 없으면 아무것도 남기지 않음.
	 *
	 * @param completion 스트림이 완주해 <b>손에 쥔 것이 있으면</b> 그것, 아니면 null. null 이면 인용 0건 ·
	 *                   사용량 null 로 저장함 - 중단·업스트림 오류 경로는 완료 이벤트가 오기 전에 끝나
	 *                   <b>정말로 모르기</b> 때문임. 알면서 버리는 것과 몰라서 비우는 것을 여기서 가름
	 */
	private void savePartial(PreparedChat prepared, UUID userId, UUID asstMsgId, String text, String status,
			boolean stopped, boolean timedOut, ChatCompletion completion) {
		if (text.isEmpty() && "complete".equals(status)) {
			return;
		}
		try {
			// 모르면 null - 추정하지 않음(FEAT-OPS-001). 아는 경우에만 completion 이 넘어옴
			chatPersistence.saveAssistant(prepared.conversationId(), userId, asstMsgId, text, status, stopped,
					timedOut,
					completion == null ? List.of() : completion.citations(),
					completion == null ? null : completion.inputTokens(),
					completion == null ? null : completion.outputTokens());
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
