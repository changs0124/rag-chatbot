package com.ragchatbot.service;

import java.io.IOException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.ragchatbot.entity.Attachment;
import com.ragchatbot.exception.ApiExceptions.BadRequestException;
import com.ragchatbot.exception.ApiExceptions.ConflictException;
import com.ragchatbot.exception.ApiExceptions.NotFoundException;
import com.ragchatbot.repository.AttachmentRepository;
import com.ragchatbot.security.FileAccessTokenService;
import com.ragchatbot.storage.FileStorage;
import com.ragchatbot.dto.FileDtos.AttachmentResponse;

/**
 * 파일 업로드/검증/서빙/고아 정리.
 * 검증 : MIME 허용목록 → 용량 상한(10MB) → 매직바이트. 서빙 : 서명 경로 토큰.
 */
@Service
public class FileService {

	private static final Logger log = LoggerFactory.getLogger(FileService.class);

	private static final long MB = 1024 * 1024;

	/** 고아 회수의 최소 유예 - 이보다 최근에 만들어진 첨부는 어떤 cutoff 를 줘도 지우지 않음 */
	private static final int MIN_ORPHAN_AGE_MINUTES = 10;

	/** webp 컨테이너의 오프셋 8에 있는 "WEBP" 마커 */
	private static final byte[] WEBP_MARKER = { 0x57, 0x45, 0x42, 0x50 };

	/** 첨부의 file_type - 받는 것이 이미지뿐이라 항상 이 값 */
	private static final String FILE_TYPE = "image";

	/** 형식마다 상한이 같아 항목별로 두지 않는다 - 갈라 둘 이유가 생기면 그때 record 로 되돌린다 */
	private static final long MAX_SIZE = 10 * MB;

	/** content-type(맵 키) → (확장자, 매직바이트) */
	private record AllowedType(String extension, byte[] magic) {
	}

	/**
	 * 이미지만 허용함. 채팅 첨부는 모델에 비전 입력으로만 전달되므로, 문서(PDF)를 받으면 사용자가
	 * "그 PDF를 근거로 답했다"고 오해함. RAG 근거 문서는 관리자 공용 스토어 경로({@code AdminDocumentService})로
	 * 올리므로, 채팅 첨부는 **문서를 받지 않는 것**을 계약으로 함.
	 */
	private static final Map<String, AllowedType> ALLOWED = Map.of(
			"image/jpeg", new AllowedType("jpg", new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF }),
			"image/png", new AllowedType("png", new byte[] { (byte) 0x89, 0x50, 0x4E, 0x47 }),
			"image/gif", new AllowedType("gif", new byte[] { 0x47, 0x49, 0x46, 0x38 }),
			"image/webp", new AllowedType("webp", new byte[] { 0x52, 0x49, 0x46, 0x46 }));

	private final FileStorage fileStorage;
	private final AttachmentRepository attachmentRepository;
	private final FileAccessTokenService fileTokenService;

	public FileService(FileStorage fileStorage, AttachmentRepository attachmentRepository,
			FileAccessTokenService fileTokenService) {
		this.fileStorage = fileStorage;
		this.attachmentRepository = attachmentRepository;
		this.fileTokenService = fileTokenService;
	}

	public AttachmentResponse upload(UUID userId, MultipartFile file) {
		if (file == null || file.isEmpty()) {
			throw new BadRequestException("빈 파일");
		}
		AllowedType type = ALLOWED.get(file.getContentType());
		if (type == null) {
			if ("application/pdf".equals(file.getContentType())) {
				throw new BadRequestException(
						"문서 첨부는 지원하지 않음 - 현재 답변 근거로 쓰이는 것은 이미지뿐임(이미지: jpg·png·gif·webp)");
			}
			throw new BadRequestException("지원하지 않는 파일 형식: " + file.getContentType());
		}
		byte[] bytes;
		try {
			bytes = file.getBytes();
		} catch (IOException e) {
			throw new BadRequestException("파일을 읽을 수 없음");
		}
		if (bytes.length > MAX_SIZE) {
			throw new BadRequestException("용량 초과(" + FILE_TYPE + " 최대 " + (MAX_SIZE / MB) + "MB)");
		}
		if (!regionEquals(bytes, 0, type.magic())) {
			throw new BadRequestException("파일 내용이 형식과 일치하지 않음");
		}
		// webp는 RIFF(0~3) 뒤 오프셋 8의 "WEBP"까지 확인 - 임의 RIFF 컨테이너 우회 차단
		if ("webp".equals(type.extension()) && !regionEquals(bytes, 8, WEBP_MARKER)) {
			throw new BadRequestException("파일 내용이 형식과 일치하지 않음");
		}

		String storagePath = fileStorage.store(userId, type.extension(), bytes);
		UUID id = UUID.randomUUID();
		attachmentRepository.insert(new Attachment(id, null, userId, storagePath, FILE_TYPE, null));
		return new AttachmentResponse(id, FILE_TYPE, issueUrl(id, userId));
	}

	/** 서빙 - 서명 토큰 검증 후 소유자 첨부만. 실패는 전부 404(존재 은닉, P-3). */
	public ServedFile serve(UUID fileId, String token) {
		UUID userId;
		try {
			userId = fileTokenService.verifyAndGetUserId(token, fileId);
		} catch (Exception e) {
			throw new NotFoundException("파일 없음");
		}
		Attachment att = attachmentRepository.findByIdAndUser(fileId, userId)
				.orElseThrow(() -> new NotFoundException("파일 없음"));
		String mediaType = ALLOWED.entrySet().stream()
				.filter(e -> att.storagePath().endsWith("." + e.getValue().extension()))
				.map(Map.Entry::getKey)
				.findFirst()
				.orElse("application/octet-stream");
		return new ServedFile(fileStorage.load(att.storagePath()), mediaType);
	}

	/**
	 * 보내기 전(초안) 첨부만 지운다(#249). 프론트가 이 API 를 쓰는 것은 입력창의 카드를 지울 때뿐이다 -
	 * 이미 보낸 메시지의 첨부를 지우면 대화 기록의 이미지와 「(이미지 첨부)」 표식이 함께 사라지므로 409 로 막는다.
	 *
	 * <p><b>행을 먼저, 파일을 나중에</b> 지운다({@code ConversationService.delete} 와 같은 순서). 행 삭제는 SQL 에서도
	 * {@code message_id is null} 을 걸어, 확인과 삭제 사이에 전송으로 연결돼도 지우지 않는다. 파일 삭제가 실패하면
	 * 행 없는 파일만 남고 그것은 고아 회수가 가져간다 - 반대 순서는 없는 파일을 가리키는 행을 남긴다.
	 */
	public void delete(UUID userId, UUID fileId) {
		Attachment att = attachmentRepository.findByIdAndUser(fileId, userId)
				.orElseThrow(() -> new NotFoundException("파일 없음"));
		if (att.messageId() != null || attachmentRepository.deleteDraftByIdAndUser(fileId, userId) == 0) {
			throw new ConflictException("이미 보낸 메시지의 첨부는 지울 수 없음");
		}
		fileStorage.delete(att.storagePath());
	}

	/**
	 * 고아(미연결) 첨부 회수(REQ-OPS-004). {@link #delete} 와 같이 <b>행을 먼저, {@code message_id is null}
	 * 을 걸어</b> 지우고 지워진 것만 파일을 지운다(#359) - 목록을 읽은 뒤 그 첨부가 전송에 실리면 행이
	 * 0개 지워지고 파일도 남는다. 종전 순서(파일 → 조건 없는 행 삭제)는 방금 보낸 메시지의 첨부를 지웠다.
	 *
	 * <p>cutoff 가 최소 유예({@value #MIN_ORPHAN_AGE_MINUTES}분)보다 최근이면 그 경계로 되돌림(클램프).
	 * 첨부는 업로드된 뒤 사용자가 전송 버튼을 누를 때까지 {@code message_id = null} 로 있으므로,
	 * cutoff 를 현재나 미래로 주면 <b>작성 중인 첨부가 지워짐</b> - 인자 하나로 살아 있는 데이터가
	 * 사라지는 경로를 남기지 않음.
	 */
	public int cleanupOrphans(OffsetDateTime cutoff) {
		OffsetDateTime effective = clampCutoff(cutoff);
		int removed = 0;
		for (Attachment a : attachmentRepository.findOrphans(effective)) {
			if (attachmentRepository.deleteDraftByIdAndUser(a.id(), a.userId()) == 1) {
				// 파일 하나가 실패해도 나머지는 이 회차에 회수한다(#365) - 행은 이미 지워져 남은 파일은 저장소 스캔 회수가 가져간다
				try {
					fileStorage.delete(a.storagePath());
				} catch (RuntimeException e) {
					log.warn("고아 첨부 파일 삭제 실패 - 저장소 스캔 회수가 다음 주기에 지움. path={}", a.storagePath(), e);
				}
				removed++;
			}
		}
		return removed;
	}

	/**
	 * 저장소 스캔 회수 - <b>파일은 있는데 그것을 가리키는 행이 없는</b> 것을 지움(REQ-OPS-004 보완).
	 *
	 * <p>{@link #cleanupOrphans}는 {@code attachments} 행을 기준으로 돌기 때문에, 대화 삭제 시
	 * cascade 로 행이 먼저 사라진 뒤 파일 삭제가 실패한 경우를 <b>구조적으로 볼 수 없음</b> - 이 패스가 그 파일을 회수함.
	 *
	 * <p>유예는 행 기준 회수와 같은 규칙임 - {@value #MIN_ORPHAN_AGE_MINUTES}분보다 최근에 <b>수정된</b>
	 * 파일은 어떤 cutoff 로도 지우지 않음. 업로드 직후 아직 행이 커밋되기 전인 파일을 지우지 않으려는 것임.
	 *
	 * <p><b>참조 목록을 통째로 읽음</b> - 단일 인스턴스·소규모 전제라 한 번에 담음. 첨부가 많아지면
	 * 경로별 존재 질의나 페이지 단위로 바꿔야 함(단일 인스턴스 전제와 같은 갈래).
	 */
	public int cleanupUnreferencedFiles(OffsetDateTime cutoff) {
		Instant effective = clampCutoff(cutoff).toInstant();

		Set<String> referenced = new HashSet<>(attachmentRepository.findAllStoragePaths());
		int removed = 0;
		for (FileStorage.StoredFile file : fileStorage.listAll()) {
			if (referenced.contains(file.storagePath()) || !file.lastModified().isBefore(effective)) {
				continue;
			}
			// 파일 하나가 실패해도 나머지는 이 회차에 회수한다(#367) - 못 지운 파일은 남아 다음 주기에 다시 대상이 된다
			try {
				fileStorage.delete(file.storagePath());
				removed++;
			} catch (RuntimeException e) {
				log.warn("미참조 파일 삭제 실패 - 다음 주기에 다시 시도함. path={}", file.storagePath(), e);
			}
		}
		return removed;
	}

	/** cutoff 가 최소 유예보다 최근이면 그 경계로 되돌림 */
	private static OffsetDateTime clampCutoff(OffsetDateTime cutoff) {
		OffsetDateTime floor = OffsetDateTime.now().minusMinutes(MIN_ORPHAN_AGE_MINUTES);
		return cutoff.isAfter(floor) ? floor : cutoff;
	}

	/** 재조회 응답용 - 조회 시점에 새 서명 URL 을 발급함(저장된 URL 재사용 금지, TTL 15분) */
	public String issueUrl(UUID fileId, UUID userId) {
		return "/api/files/" + fileId + "?token=" + fileTokenService.issue(fileId, userId);
	}

	/** 매직 바이트 비교. {@link AdminDocumentService} 의 문서 검사도 이것을 쓴다(#300) */
	static boolean regionEquals(byte[] data, int offset, byte[] marker) {
		if (data.length < offset + marker.length) {
			return false;
		}
		return Arrays.equals(data, offset, offset + marker.length, marker, 0, marker.length);
	}

	public record ServedFile(Resource resource, String contentType) {
	}
}
