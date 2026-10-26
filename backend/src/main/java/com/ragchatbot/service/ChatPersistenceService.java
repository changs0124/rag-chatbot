package com.ragchatbot.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ragchatbot.entity.Citation;
import com.ragchatbot.entity.Message;
import com.ragchatbot.repository.AttachmentRepository;
import com.ragchatbot.repository.CitationRepository;
import com.ragchatbot.repository.ConversationRepository;
import com.ragchatbot.repository.MessageRepository;
import com.ragchatbot.openai.OpenAiService.CitationData;

/**
 * 어시스턴트 메시지 + 출처 영속화를 하나의 트랜잭션으로 묶음.
 * 스트리밍(onToken) 구간과 분리해, 스트리밍 중에는 DB 커넥션을 잡지 않으면서도
 * 저장 3단계(메시지·출처·touch)의 원자성을 보장함(부분 저장·불일치 방지).
 */
@Service
public class ChatPersistenceService {

	private final MessageRepository messageRepository;
	private final CitationRepository citationRepository;
	private final ConversationRepository conversationRepository;
	private final AttachmentRepository attachmentRepository;

	public ChatPersistenceService(MessageRepository messageRepository, CitationRepository citationRepository,
			ConversationRepository conversationRepository, AttachmentRepository attachmentRepository) {
		this.messageRepository = messageRepository;
		this.citationRepository = citationRepository;
		this.conversationRepository = conversationRepository;
		this.attachmentRepository = attachmentRepository;
	}

	/**
	 * stopped · timedOut 의 뜻과 세 갈래는 {@link Message} 머리 주석(#84). 둘은 별개의 축이라 함께 참일 수 있고,
	 * 정상 저장 경로에서도 timedOut 이 참일 수 있음.
	 *
	 * <p>토큰 사용량은 모르면 null 로 넘어옴 - 여기서 0 으로 바꾸지 않음(FEAT-OPS-001).
	 */
	@Transactional
	public void saveAssistant(UUID conversationId, UUID userId, UUID assistantMsgId, String content, String status,
			boolean stopped, boolean timedOut, List<CitationData> citations, Integer inputTokens,
			Integer outputTokens) {
		messageRepository.insert(new Message(assistantMsgId, conversationId, "assistant", content, status, stopped,
				timedOut, inputTokens, outputTokens, null));
		for (CitationData c : citations) {
			citationRepository.insert(new Citation(UUID.randomUUID(), assistantMsgId, c.seq(), c.sourceName(),
					c.snippet(), null));
		}
		conversationRepository.touch(conversationId, userId);
	}

	/**
	 * 답 없이 끊긴 턴의 질문을 걷는다(#489). 첨부는 연결만 풀어 입력창 카드로 다시 쓸 수 있게 둔다 -
	 * 풀린 첨부는 보내기 전 첨부와 같아져, 다시 보내지 않으면 업로드 시각 기준 고아 회수가 가져간다(REQ-OPS-004).
	 *
	 * <p><b>메시지 행부터 잠근다</b> - 대화 삭제의 cascade 는 messages → attachments 순으로 잠그므로 같은 순서여야 교착이 나지 않는다.
	 * 행이 없으면(대화가 이미 지워짐) 할 일이 없다.
	 * <b>그다음 연결을 푼다</b> - {@code attachments.message_id} 가 on delete cascade 라 메시지를 먼저 지우면 첨부 행까지 사라진다.
	 * 대화는 건드리지 않는다 - 질문 저장은 touch 하지 않았고, 비게 된 새 대화는 프론트가 조건부 삭제로 정리한다(#440 · #447)
	 */
	@Transactional
	public void retractQuestion(UUID conversationId, UUID userMessageId) {
		if (messageRepository.lockUserMessage(userMessageId, conversationId) == null) {
			return;
		}
		attachmentRepository.unlinkFromMessage(userMessageId);
		messageRepository.deleteUserMessage(userMessageId, conversationId);
	}
}
