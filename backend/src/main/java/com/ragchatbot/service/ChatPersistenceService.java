package com.ragchatbot.service;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ragchatbot.domain.Citation;
import com.ragchatbot.domain.Message;
import com.ragchatbot.mapper.CitationMapper;
import com.ragchatbot.mapper.ConversationMapper;
import com.ragchatbot.mapper.MessageMapper;
import com.ragchatbot.openai.OpenAiService.CitationData;

/**
 * 어시스턴트 메시지 + 출처 영속화를 하나의 트랜잭션으로 묶음.
 * 스트리밍(onToken) 구간과 분리해, 스트리밍 중에는 DB 커넥션을 잡지 않으면서도
 * 저장 3단계(메시지·출처·touch)의 원자성을 보장함(부분 저장·불일치 방지).
 */
@Service
public class ChatPersistenceService {

	private final MessageMapper messageMapper;
	private final CitationMapper citationMapper;
	private final ConversationMapper conversationMapper;

	public ChatPersistenceService(MessageMapper messageMapper, CitationMapper citationMapper,
			ConversationMapper conversationMapper) {
		this.messageMapper = messageMapper;
		this.citationMapper = citationMapper;
		this.conversationMapper = conversationMapper;
	}

	/** stopped=true 는 사용자가 스트림을 끊어 <b>출처 판정 전에</b> 끝났음을 뜻함(무자료 배너 억제용) */
	@Transactional
	public void saveAssistant(UUID conversationId, UUID userId, UUID assistantMsgId, String content, String status,
			boolean stopped, List<CitationData> citations) {
		messageMapper.insert(new Message(assistantMsgId, conversationId, "assistant", content, status, stopped, null));
		for (CitationData c : citations) {
			citationMapper.insert(new Citation(UUID.randomUUID(), assistantMsgId, c.seq(), c.sourceName(),
					c.snippet(), c.uri(), null));
		}
		conversationMapper.touch(conversationId, userId);
	}
}
