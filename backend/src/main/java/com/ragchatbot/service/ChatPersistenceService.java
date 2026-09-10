package com.ragchatbot.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ragchatbot.entity.Citation;
import com.ragchatbot.entity.Message;
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

	public ChatPersistenceService(MessageRepository messageRepository, CitationRepository citationRepository,
			ConversationRepository conversationRepository) {
		this.messageRepository = messageRepository;
		this.citationRepository = citationRepository;
		this.conversationRepository = conversationRepository;
	}

	/**
	 * stopped=true 는 사용자가 스트림을 끊어 <b>출처 판정 전에</b> 끝났음을 뜻함(무자료 배너 억제용).
	 *
	 * <p>timedOut=true 는 <b>서버가 스트림을 타임아웃으로 닫았음</b>을 뜻함(#84). stopped 와 별개의
	 * 축이라 함께 참일 수 있고, 정상 저장 경로에서도 참일 수 있음 - 타임아웃 뒤 업스트림이 뒤늦게
	 * 응답해 전문이 저장되는 갈래가 있기 때문임.
	 *
	 * <p>토큰 사용량은 모르면 null 로 넘어옴(FEAT-OPS-001) - 중단·오류 경로는 완료 이벤트를 받지
	 * 못해 값이 없음. 여기서 0 으로 바꾸지 않음.
	 */
	@Transactional
	public void saveAssistant(UUID conversationId, UUID userId, UUID assistantMsgId, String content, String status,
			boolean stopped, boolean timedOut, List<CitationData> citations, Integer inputTokens,
			Integer outputTokens) {
		messageRepository.insert(new Message(assistantMsgId, conversationId, "assistant", content, status, stopped,
				timedOut, inputTokens, outputTokens, null));
		for (CitationData c : citations) {
			citationRepository.insert(new Citation(UUID.randomUUID(), assistantMsgId, c.seq(), c.sourceName(),
					c.snippet(), c.uri(), null));
		}
		conversationRepository.touch(conversationId, userId);
	}
}
