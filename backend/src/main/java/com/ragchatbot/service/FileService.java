package com.ragchatbot.service;

import java.io.IOException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.ragchatbot.domain.Attachment;
import com.ragchatbot.error.ApiExceptions.BadRequestException;
import com.ragchatbot.error.ApiExceptions.NotFoundException;
import com.ragchatbot.mapper.AttachmentMapper;
import com.ragchatbot.security.FileAccessTokenService;
import com.ragchatbot.storage.FileStorage;
import com.ragchatbot.web.dto.FileDtos.AttachmentResponse;

/**
 * 파일 업로드/검증/서빙/고아 정리.
 * 검증 : MIME 허용목록 → 타입별 용량 → 매직바이트(AC-11). 서빙 : 서명 경로 토큰(AC-22, M6).
 */
@Service
public class FileService {

	private static final long MB = 1024 * 1024;

	/** 고아 회수의 최소 유예 - 이보다 최근에 만들어진 첨부는 어떤 cutoff 를 줘도 지우지 않음 */
	static final int MIN_ORPHAN_AGE_MINUTES = 10;

	/** webp 컨테이너의 오프셋 8에 있는 "WEBP" 마커 */
	private static final byte[] WEBP_MARKER = { 0x57, 0x45, 0x42, 0x50 };

	/** content-type → (확장자, 파일유형, 최대크기, 매직바이트) */
	private record AllowedType(String extension, String fileType, long maxSize, byte[] magic, String mediaType) {
	}

	/**
	 * 이미지만 허용함(2026-07-28 R-2 범위 축소, 사용자 승인).
	 * 문서(PDF)는 업로드·저장·표시는 되는데 모델에는 전달되지 않아, 사용자가 "그 PDF를 근거로 답했다"고
	 * 오해하는 상태였음(Phase 4 리뷰 H4-3). 실제 근거로 쓰려면 OpenAI Files + 대화 전용 Vector Store
	 * 업로드가 필요하고 그건 실 키가 있어야 검증되므로, 지금은 **받지 않는 것**을 계약으로 함.
	 */
	private static final Map<String, AllowedType> ALLOWED = Map.of(
			"image/jpeg", new AllowedType("jpg", "image", 10 * MB, new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF }, "image/jpeg"),
			"image/png", new AllowedType("png", "image", 10 * MB, new byte[] { (byte) 0x89, 0x50, 0x4E, 0x47 }, "image/png"),
			"image/gif", new AllowedType("gif", "image", 10 * MB, new byte[] { 0x47, 0x49, 0x46, 0x38 }, "image/gif"),
			"image/webp", new AllowedType("webp", "image", 10 * MB, new byte[] { 0x52, 0x49, 0x46, 0x46 }, "image/webp"));

	private final FileStorage fileStorage;
	private final AttachmentMapper attachmentMapper;
	private final FileAccessTokenService fileTokenService;

	public FileService(FileStorage fileStorage, AttachmentMapper attachmentMapper,
			FileAccessTokenService fileTokenService) {
		this.fileStorage = fileStorage;
		this.attachmentMapper = attachmentMapper;
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
		if (bytes.length > type.maxSize()) {
			throw new BadRequestException("용량 초과(" + type.fileType() + " 최대 " + (type.maxSize() / MB) + "MB)");
		}
		if (!startsWith(bytes, type.magic())) {
			throw new BadRequestException("파일 내용이 형식과 일치하지 않음");
		}
		// webp는 RIFF(0~3) 뒤 오프셋 8의 "WEBP"까지 확인 - 임의 RIFF 컨테이너 우회 차단
		if ("webp".equals(type.extension()) && !regionEquals(bytes, 8, WEBP_MARKER)) {
			throw new BadRequestException("파일 내용이 형식과 일치하지 않음");
		}

		String storagePath = fileStorage.store(userId, type.extension(), bytes);
		UUID id = UUID.randomUUID();
		attachmentMapper.insert(new Attachment(id, null, userId, storagePath, type.fileType(), null, null));
		return new AttachmentResponse(id, type.fileType(), buildUrl(id, userId));
	}

	/** 서빙 - 서명 토큰 검증 후 소유자 첨부만. 실패는 전부 404(존재 은닉, P-3). */
	public ServedFile serve(UUID fileId, String token) {
		UUID userId;
		try {
			userId = fileTokenService.verifyAndGetUserId(token, fileId);
		} catch (Exception e) {
			throw new NotFoundException("파일 없음");
		}
		Attachment att = attachmentMapper.findByIdAndUser(fileId, userId)
				.orElseThrow(() -> new NotFoundException("파일 없음"));
		String mediaType = ALLOWED.values().stream()
				.filter(t -> att.storagePath().endsWith("." + t.extension()))
				.map(AllowedType::mediaType)
				.findFirst()
				.orElse("application/octet-stream");
		return new ServedFile(fileStorage.load(att.storagePath()), mediaType);
	}

	public void delete(UUID userId, UUID fileId) {
		Attachment att = attachmentMapper.findByIdAndUser(fileId, userId)
				.orElseThrow(() -> new NotFoundException("파일 없음"));
		fileStorage.delete(att.storagePath());
		attachmentMapper.deleteByIdAndUser(fileId, userId);
	}

	/**
	 * 고아(미연결) 첨부 회수 - 파일 삭제 후 행 삭제(AC-13).
	 *
	 * <p>cutoff 가 최소 유예({@value #MIN_ORPHAN_AGE_MINUTES}분)보다 최근이면 그 경계로 되돌림(클램프).
	 * 첨부는 업로드된 뒤 사용자가 전송 버튼을 누를 때까지 {@code message_id = null} 로 있으므로,
	 * cutoff 를 현재나 미래로 주면 <b>작성 중인 첨부가 지워짐</b> - 인자 하나로 살아 있는 데이터가
	 * 사라지는 경로를 남기지 않음(2026-07-28 결정).
	 */
	public int cleanupOrphans(OffsetDateTime cutoff) {
		OffsetDateTime floor = OffsetDateTime.now().minusMinutes(MIN_ORPHAN_AGE_MINUTES);
		OffsetDateTime effective = cutoff.isAfter(floor) ? floor : cutoff;
		var orphans = attachmentMapper.findOrphans(effective);
		for (Attachment a : orphans) {
			fileStorage.delete(a.storagePath());
			attachmentMapper.deleteById(a.id());
		}
		return orphans.size();
	}

	/**
	 * 저장소 스캔 회수 - <b>파일은 있는데 그것을 가리키는 행이 없는</b> 것을 지움(AC-13 보완).
	 *
	 * <p>{@link #cleanupOrphans}는 {@code attachments} 행을 기준으로 돌기 때문에, 대화 삭제 시
	 * cascade 로 행이 먼저 사라진 뒤 파일 삭제가 실패한 경우를 <b>구조적으로 볼 수 없음</b>. 그 파일은
	 * 종전에 경고 로그만 남기고 영구 잔류했음(2026-07-28 결정으로 이 패스를 넣음).
	 *
	 * <p>유예는 행 기준 회수와 같은 규칙임 - {@value #MIN_ORPHAN_AGE_MINUTES}분보다 최근에 <b>수정된</b>
	 * 파일은 어떤 cutoff 로도 지우지 않음. 업로드 직후 아직 행이 커밋되기 전인 파일을 지우지 않으려는 것임.
	 *
	 * <p><b>참조 목록을 통째로 읽음</b> - 단일 인스턴스·소규모 전제라 한 번에 담음. 첨부가 많아지면
	 * 경로별 존재 질의나 페이지 단위로 바꿔야 함(R-6과 같은 갈래).
	 */
	public int cleanupUnreferencedFiles(OffsetDateTime cutoff) {
		OffsetDateTime floor = OffsetDateTime.now().minusMinutes(MIN_ORPHAN_AGE_MINUTES);
		Instant effective = (cutoff.isAfter(floor) ? floor : cutoff).toInstant();

		Set<String> referenced = new HashSet<>(attachmentMapper.findAllStoragePaths());
		int removed = 0;
		for (FileStorage.StoredFile file : fileStorage.listAll()) {
			if (referenced.contains(file.storagePath()) || !file.lastModified().isBefore(effective)) {
				continue;
			}
			fileStorage.delete(file.storagePath());
			removed++;
		}
		return removed;
	}

	/** 재조회 응답용 - 조회 시점에 새 서명 URL 을 발급함(저장된 URL 재사용 금지, TTL 15분) */
	public String issueUrl(UUID fileId, UUID userId) {
		return buildUrl(fileId, userId);
	}

	private String buildUrl(UUID fileId, UUID userId) {
		return "/api/files/" + fileId + "?token=" + fileTokenService.issue(fileId, userId);
	}

	private static boolean startsWith(byte[] data, byte[] prefix) {
		if (data.length < prefix.length) {
			return false;
		}
		return Arrays.equals(data, 0, prefix.length, prefix, 0, prefix.length);
	}

	private static boolean regionEquals(byte[] data, int offset, byte[] marker) {
		if (data.length < offset + marker.length) {
			return false;
		}
		return Arrays.equals(data, offset, offset + marker.length, marker, 0, marker.length);
	}

	public record ServedFile(Resource resource, String contentType) {
	}
}
