package com.ragchatbot.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.ragchatbot.entity.Attachment;
import com.ragchatbot.entity.Citation;
import com.ragchatbot.entity.Conversation;
import com.ragchatbot.exception.ApiExceptions.NotFoundException;
import com.ragchatbot.repository.AttachmentRepository;
import com.ragchatbot.repository.CitationRepository;
import com.ragchatbot.repository.ConversationRepository;
import com.ragchatbot.repository.MessageRepository;
import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.storage.FileStorage;
import com.ragchatbot.dto.ConversationDtos.CitationResponse;
import com.ragchatbot.dto.ConversationDtos.ConversationResponse;
import com.ragchatbot.dto.ConversationDtos.MessageResponse;
import com.ragchatbot.dto.FileDtos.AttachmentResponse;

/**
 * 대화 CRUD. 모든 접근은 requireOwned 를 통과함(P-3, AC-1). 남의 것은 404로 은닉.
 */
@Service
public class ConversationService {

	private static final Logger log = LoggerFactory.getLogger(ConversationService.class);

	private final ConversationRepository conversationRepository;
	private final MessageRepository messageRepository;
	private final AttachmentRepository attachmentRepository;
	private final CitationRepository citationRepository;
	private final FileStorage fileStorage;
	private final OpenAiService openAiService;
	private final FileService fileService;

	public ConversationService(ConversationRepository conversationRepository, MessageRepository messageRepository,
			AttachmentRepository attachmentRepository, CitationRepository citationRepository, FileStorage fileStorage,
			OpenAiService openAiService, FileService fileService) {
		this.conversationRepository = conversationRepository;
		this.messageRepository = messageRepository;
		this.attachmentRepository = attachmentRepository;
		this.citationRepository = citationRepository;
		this.fileStorage = fileStorage;
		this.openAiService = openAiService;
		this.fileService = fileService;
	}

	public ConversationResponse create(UUID userId, String title) {
		UUID id = UUID.randomUUID();
		String finalTitle = (title == null || title.isBlank()) ? "새 대화" : title.trim();
		conversationRepository.insert(new Conversation(id, userId, finalTitle, null, null, null));
		return findOwnedResponse(id, userId);
	}

	public ConversationResponse rename(UUID userId, UUID conversationId, String title) {
		requireOwned(conversationId, userId);
		conversationRepository.updateTitle(conversationId, userId, title.trim());
		return findOwnedResponse(conversationId, userId);
	}

	public List<ConversationResponse> list(UUID userId) {
		return conversationRepository.listByUser(userId).stream()
				.map(c -> new ConversationResponse(c.id(), c.title(), c.createdAt(), c.updatedAt()))
				.toList();
	}

	/** 메시지 + 출처(AC-7 재조회 시 유지) + 첨부(새로고침 시 이미지 소실 방지) */
	public List<MessageResponse> messages(UUID userId, UUID conversationId) {
		requireOwned(conversationId, userId);

		// 첨부·출처 모두 대화 단위로 한 번에 읽어 메시지별로 나눠 담음(메시지마다 조회하지 않음)
		Map<UUID, List<AttachmentResponse>> attachmentsByMessage = new LinkedHashMap<>();
		for (Attachment a : attachmentRepository.findByConversation(conversationId)) {
			attachmentsByMessage.computeIfAbsent(a.messageId(), k -> new ArrayList<>())
					.add(new AttachmentResponse(a.id(), a.fileType(), fileService.issueUrl(a.id(), userId)));
		}
		Map<UUID, List<CitationResponse>> citationsByMessage = new LinkedHashMap<>();
		for (Citation c : citationRepository.findByConversation(conversationId)) {
			citationsByMessage.computeIfAbsent(c.messageId(), k -> new ArrayList<>())
					.add(new CitationResponse(c.seq(), c.sourceName(), c.snippet(), c.uri()));
		}

		return messageRepository.listByConversation(conversationId).stream()
				.map(m -> new MessageResponse(m.id(), m.role(), m.content(), m.status(), m.stopped(), m.timedOut(),
						m.createdAt(),
						citationsByMessage.getOrDefault(m.id(), List.of()),
						attachmentsByMessage.getOrDefault(m.id(), List.of())))
				.toList();
	}

	/**
	 * 대화 삭제 - **DB 를 먼저 지우고, 되돌릴 수 없는 외부 정리는 그 뒤에** 함(AC-12).
	 *
	 * <p>이전에는 한 트랜잭션 안에서 파일 삭제와 OpenAI DELETE 를 먼저 수행했음. 커밋이 실패하면
	 * 파일만 사라진 채 행이 남고, 원격 호출이 지연되면 그동안 DB 커넥션을 점유했음(Phase 3 리뷰 H3-1).
	 * cascade 삭제는 단일 문장이라 그 자체로 원자적이므로 별도 트랜잭션이 필요 없음.
	 *
	 * <p><b>주의</b> - DB 가 먼저 지워지므로 그 뒤 파일 삭제가 실패하면 <b>대응하는 행이 이미 없어
	 * 행 기준 회수({@link FileService#cleanupOrphans})가 찾지 못함</b>. {@code findOrphans} 는
	 * {@code attachments} 행을 기준으로 도는데 cascade 로 그 행이 사라졌기 때문임(재리뷰 지적 3).
	 *
	 * <p><b>그 잔류는 저장소 스캔 패스가 지움</b> - {@link FileService#cleanupUnreferencedFiles} 가
	 * 파일 쪽에서 돌며 <i>가리키는 행이 없는</i> 것을 회수하고, {@code OrphanCleanupScheduler} 가 매시
	 * 정각 2차 패스로 부름. 즉 여기서 나는 경고는 <b>영구 손실이 아니라 회수 대기</b>임
	 * ({@code FileFlowTest.unreferenced_old_file_is_removed_by_scan} 가 이 경로를 잠금).
	 */
	public void delete(UUID userId, UUID conversationId) {
		Conversation conversation = requireOwned(conversationId, userId);
		List<Attachment> attachments = attachmentRepository.findByConversation(conversationId);
		List<String> openaiFileIds = new ArrayList<>();
		List<String> paths = new ArrayList<>();
		for (Attachment a : attachments) {
			paths.add(a.storagePath());
			if (a.openaiFileId() != null) {
				openaiFileIds.add(a.openaiFileId());
			}
		}

		conversationRepository.deleteByIdAndUser(conversationId, userId); // cascade - 단일 문장

		for (String path : paths) {
			try {
				fileStorage.delete(path);
			} catch (RuntimeException e) {
				// "영구 잔류" 라고 적지 않음 - 저장소 스캔 패스(cleanupUnreferencedFiles)가 매시 정각에
				// 회수함. 손실로 읽히면 운영자가 없는 사고를 쫓게 됨
				log.warn("대화 삭제 후 첨부 파일 정리 실패 - 행이 없어 행 기준 회수는 못 보지만 "
						+ "저장소 스캔 회수가 다음 주기에 지움. path={}", path, e);
			}
		}
		try {
			// OpenAI 파일/Vector Store 정리(AC-12). 목업은 호출 기록만.
			// **현재 이 호출은 항상 (null, []) 이라 아무 일도 하지 않는다**(#124) - 두 값에 값이
			// 들어가는 자리가 없기 때문이다. 바로 위 openaiFileId != null 분기도 같은 이유로
			// 도달 불가다. 근거는 OpenAiService.deleteResources 의 설명에 있다
			openAiService.deleteResources(conversation.vectorStoreId(), openaiFileIds);
		} catch (RuntimeException e) {
			log.warn("대화 삭제 후 OpenAI 리소스 정리 실패. conversationId={}", conversationId, e);
		}
	}

	private Conversation requireOwned(UUID conversationId, UUID userId) {
		return conversationRepository.findByIdAndUser(conversationId, userId)
				.orElseThrow(() -> new NotFoundException("대화 없음"));
	}

	private ConversationResponse findOwnedResponse(UUID conversationId, UUID userId) {
		Conversation c = requireOwned(conversationId, userId);
		return new ConversationResponse(c.id(), c.title(), c.createdAt(), c.updatedAt());
	}
}
