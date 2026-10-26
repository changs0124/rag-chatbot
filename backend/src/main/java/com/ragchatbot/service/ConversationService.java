package com.ragchatbot.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.ragchatbot.entity.Attachment;
import com.ragchatbot.entity.Citation;
import com.ragchatbot.entity.Conversation;
import com.ragchatbot.exception.ApiExceptions.BadRequestException;
import com.ragchatbot.exception.ApiExceptions.ConflictException;
import com.ragchatbot.exception.ApiExceptions.NotFoundException;
import com.ragchatbot.repository.AttachmentRepository;
import com.ragchatbot.repository.CitationRepository;
import com.ragchatbot.repository.ConversationRepository;
import com.ragchatbot.repository.MessageRepository;
import com.ragchatbot.storage.FileStorage;
import com.ragchatbot.dto.ConversationDtos.CitationResponse;
import com.ragchatbot.dto.ConversationDtos.ConversationResponse;
import com.ragchatbot.dto.ConversationDtos.MessageResponse;
import com.ragchatbot.dto.FileDtos.AttachmentResponse;

/**
 * 대화 CRUD. 모든 접근에 소유자 조건(user_id)을 건다(P-3) - 단건은 requireOwned 와 잠그는 변형(requireOwnedLocked ·
 * lockByIdAndUser), 목록은 user_id 조건 질의. 남의 것은 404로 은닉.
 */
@Service
public class ConversationService {

	private static final Logger log = LoggerFactory.getLogger(ConversationService.class);

	private final ConversationRepository conversationRepository;
	private final MessageRepository messageRepository;
	private final AttachmentRepository attachmentRepository;
	private final CitationRepository citationRepository;
	private final FileStorage fileStorage;
	private final FileService fileService;
	private final int maxTitleChars;

	public ConversationService(ConversationRepository conversationRepository, MessageRepository messageRepository,
			AttachmentRepository attachmentRepository, CitationRepository citationRepository, FileStorage fileStorage,
			FileService fileService,
			@Value("${app.chat.max-title-chars}") int maxTitleChars) {
		this.conversationRepository = conversationRepository;
		this.messageRepository = messageRepository;
		this.attachmentRepository = attachmentRepository;
		this.citationRepository = citationRepository;
		this.fileStorage = fileStorage;
		this.fileService = fileService;
		this.maxTitleChars = maxTitleChars;
	}

	public ConversationResponse create(UUID userId, String title) {
		UUID id = UUID.randomUUID();
		String finalTitle = (title == null || title.isBlank()) ? "새 대화" : requireTitleLength(title.trim());
		conversationRepository.insert(new Conversation(id, userId, finalTitle, null, null));
		return findOwnedResponse(id, userId);
	}

	public ConversationResponse rename(UUID userId, UUID conversationId, String title) {
		requireOwned(conversationId, userId);
		conversationRepository.updateTitle(conversationId, userId, requireTitleLength(title.trim()));
		return findOwnedResponse(conversationId, userId);
	}

	public List<ConversationResponse> list(UUID userId) {
		return conversationRepository.listByUser(userId).stream()
				.map(ConversationService::toResponse)
				.toList();
	}

	/** 메시지 + 출처(재조회 시 유지, REQ-RAG-002) + 첨부(새로고침 시 이미지 소실 방지) */
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
					.add(new CitationResponse(c.seq(), c.sourceName(), c.snippet()));
		}

		return messageRepository.listByConversation(conversationId).stream()
				.map(m -> new MessageResponse(m.id(), m.role(), m.content(), m.status(), m.stopped(), m.timedOut(),
						m.createdAt(),
						citationsByMessage.getOrDefault(m.id(), List.of()),
						attachmentsByMessage.getOrDefault(m.id(), List.of())))
				.toList();
	}

	/**
	 * 대화 삭제 - **DB 를 먼저 지우고, 되돌릴 수 없는 외부 정리는 그 뒤에** 함.
	 *
	 * <p>외부 정리를 트랜잭션 안에서 먼저 하면 커밋 실패 시 파일만 사라진 채 행이 남고, 원격 호출이
	 * 지연되는 동안 DB 커넥션을 점유함. cascade 삭제는 단일 문장이라 그 자체로 원자적이므로 별도 트랜잭션이 필요 없음.
	 *
	 * <p><b>주의</b> - DB 가 먼저 지워지므로 그 뒤 파일 삭제가 실패하면 <b>대응하는 행이 이미 없어
	 * 행 기준 회수({@link FileService#cleanupOrphans})가 찾지 못함</b>. {@code findOrphans} 는
	 * {@code attachments} 행을 기준으로 도는데 cascade 로 그 행이 사라졌기 때문임.
	 *
	 * <p><b>그 잔류는 저장소 스캔 패스가 지움</b> - {@link FileService#cleanupUnreferencedFiles} 가
	 * 파일 쪽에서 돌며 <i>가리키는 행이 없는</i> 것을 회수하고, {@code OrphanCleanupScheduler} 가 매시
	 * 정각 2차 패스로 부름. 즉 여기서 나는 경고는 <b>영구 손실이 아니라 회수 대기</b>임
	 * ({@code FileFlowTest.unreferenced_old_file_is_removed_by_scan} 가 이 경로를 잠금).
	 */
	public void delete(UUID userId, UUID conversationId) {
		requireOwned(conversationId, userId);
		List<Attachment> attachments = attachmentRepository.findByConversation(conversationId);
		List<String> paths = new ArrayList<>();
		for (Attachment a : attachments) {
			paths.add(a.storagePath());
		}

		conversationRepository.deleteByIdAndUser(conversationId, userId); // cascade - 단일 문장

		for (String path : paths) {
			try {
				fileStorage.delete(path);
			} catch (RuntimeException e) {
				log.warn("대화 삭제 후 첨부 파일 정리 실패 - 행이 없어 행 기준 회수는 못 보지만 "
						+ "저장소 스캔 회수가 다음 주기에 지움. path={}", path, e);
			}
		}
	}

	/**
	 * 메시지가 하나도 없을 때만 지운다(#447) - 있으면 409, 아무것도 지우지 않는다.
	 *
	 * <p>화면이 200 전에 끊긴 새 대화를 치울 때 쓴다(#440). 조건 없는 {@link #delete} 는 그사이 채팅 준비가 커밋한 질문 · 첨부를
	 * cascade 로 지웠다. 행을 FOR UPDATE 로 잠그면 준비({@link ChatService#prepare} 의 KEY SHARE · 질문 삽입의 외래 키 잠금)가
	 * 끝나기를 기다리고, 그 뒤의 존재 확인은 새 문장이라 막 커밋된 질문을 본다. 삭제가 먼저 잠그면 준비가 기다렸다가 404 로 끝난다.
	 * 메시지가 없으니 연결된 첨부도 없어 파일 정리는 하지 않는다 - 올려 둔 초안 첨부는 그대로 다시 쓸 수 있다.
	 *
	 * <p><b>READ COMMITTED 전제</b> - 존재 확인이 잠금 대기 뒤의 새 스냅샷을 봐야 한다. 더 높은 격리면 대기 전 스냅샷을 써서
	 * 막 커밋된 질문을 못 본다. 잠금을 쥔 채 기다리므로 준비는 짧아야 한다(원격 호출을 넣지 않는다 - 지금은 DB 만 쓴다).
	 */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public void deleteIfEmpty(UUID userId, UUID conversationId) {
		conversationRepository.lockByIdAndUser(conversationId, userId)
				.orElseThrow(() -> new NotFoundException("대화 없음"));
		if (messageRepository.existsByConversation(conversationId)) {
			throw new ConflictException("메시지가 있는 대화는 지우지 않음");
		}
		conversationRepository.deleteByIdAndUser(conversationId, userId);
	}

	/** 제목 길이 상한(#371). 잘라 저장하지 않고 거절한다 - 자르면 사용자가 쓴 것과 다른 제목이 조용히 남는다 */
	private String requireTitleLength(String title) {
		TextInputs.requireStorable(title, "제목");
		if (title.codePointCount(0, title.length()) > maxTitleChars) {
			throw new BadRequestException("제목은 " + maxTitleChars + "자까지 쓸 수 있음");
		}
		return title;
	}

	/** 소유 확인의 단일 경로(#389). 채팅 준비(ChatService.prepare)는 잠그는 변형 {@link #requireOwnedLocked} 를 쓴다(#447) */
	Conversation requireOwned(UUID conversationId, UUID userId) {
		return conversationRepository.findByIdAndUser(conversationId, userId)
				.orElseThrow(() -> new NotFoundException("대화 없음"));
	}

	/**
	 * 채팅 준비의 소유 확인(#447) - 행을 KEY SHARE 로 잠가 같은 대화의 {@link #deleteIfEmpty} 와 순서를 정한다.
	 * 잠그지 않으면 확인과 질문 삽입 사이에 삭제가 끼어 외래 키 위반으로 끝났다. 트랜잭션 안에서 불러야 한다
	 */
	Conversation requireOwnedLocked(UUID conversationId, UUID userId) {
		return conversationRepository.lockSharedByIdAndUser(conversationId, userId)
				.orElseThrow(() -> new NotFoundException("대화 없음"));
	}

	private ConversationResponse findOwnedResponse(UUID conversationId, UUID userId) {
		return toResponse(requireOwned(conversationId, userId));
	}

	private static ConversationResponse toResponse(Conversation c) {
		return new ConversationResponse(c.id(), c.title(), c.createdAt(), c.updatedAt());
	}
}
