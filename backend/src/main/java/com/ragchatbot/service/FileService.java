package com.ragchatbot.service;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Map;
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

	/** content-type → (확장자, 파일유형, 최대크기, 매직바이트) */
	private record AllowedType(String extension, String fileType, long maxSize, byte[] magic, String mediaType) {
	}

	private static final Map<String, AllowedType> ALLOWED = Map.of(
			"image/jpeg", new AllowedType("jpg", "image", 10 * MB, new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF }, "image/jpeg"),
			"image/png", new AllowedType("png", "image", 10 * MB, new byte[] { (byte) 0x89, 0x50, 0x4E, 0x47 }, "image/png"),
			"image/gif", new AllowedType("gif", "image", 10 * MB, new byte[] { 0x47, 0x49, 0x46, 0x38 }, "image/gif"),
			"image/webp", new AllowedType("webp", "image", 10 * MB, new byte[] { 0x52, 0x49, 0x46, 0x46 }, "image/webp"),
			"application/pdf", new AllowedType("pdf", "document", 20 * MB, new byte[] { 0x25, 0x50, 0x44, 0x46 }, "application/pdf"));

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

	/** 고아(미연결) 첨부 회수 - 파일 삭제 후 행 삭제(AC-13) */
	public int cleanupOrphans(OffsetDateTime cutoff) {
		var orphans = attachmentMapper.findOrphans(cutoff);
		for (Attachment a : orphans) {
			fileStorage.delete(a.storagePath());
			attachmentMapper.deleteById(a.id());
		}
		return orphans.size();
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

	public record ServedFile(Resource resource, String contentType) {
	}
}
