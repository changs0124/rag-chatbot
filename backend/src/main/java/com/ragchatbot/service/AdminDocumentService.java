package com.ragchatbot.service;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.ragchatbot.domain.RagDocument;
import com.ragchatbot.domain.RagDocumentSummary;
import com.ragchatbot.error.ApiExceptions.BadRequestException;
import com.ragchatbot.error.ApiExceptions.NotFoundException;
import com.ragchatbot.mapper.RagDocumentMapper;
import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.openai.OpenAiService.UploadedDocument;
import com.ragchatbot.web.dto.AdminDtos.DocumentResponse;

/**
 * RAG 문서 관리(FEAT-ADMIN-002). 업로드 · 목록 · 삭제.
 *
 * <p>권한 검사는 {@link AdminAccessGuard} 가 컨트롤러 앞에서 하므로 여기서는 다루지 않는다.
 *
 * <p><b>허용 형식이 채팅 첨부와 반대다.</b> 채팅 첨부(`FileService`)는 비전 입력용이라 이미지만
 * 받고, 여기는 색인용이라 문서만 받는다. 두 목록이 서로 새면 안 된다.
 */
@Service
public class AdminDocumentService {

	private static final Logger log = LoggerFactory.getLogger(AdminDocumentService.class);

	private static final long MB = 1024 * 1024;

	/**
	 * 최대 크기. OpenAI 상한(512MB)보다 훨씬 낮게 둔다 - 상한에 맞추면 요청 하나가 멀티파트 버퍼를
	 * 512MB 잡아 단일 인스턴스가 그대로 멎는다. 사내 규정 문서는 대부분 수 MB다.
	 * 필요해지면 스트리밍 업로드로 바꾼 뒤 올린다.
	 */
	private static final long MAX_SIZE = 50 * MB;

	/** PDF 매직바이트. txt·md 는 매직바이트가 없고 docx 는 zip 이라 `PK` 만으로는 다른 zip 과 구분되지 않는다 */
	private static final byte[] PDF_MAGIC = { 0x25, 0x50, 0x44, 0x46 }; // %PDF

	private static final Map<String, String> ALLOWED = Map.of(
			"application/pdf", "pdf",
			"text/plain", "txt",
			"text/markdown", "md",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx");

	private final RagDocumentMapper documentMapper;
	private final OpenAiService openAiService;

	public AdminDocumentService(RagDocumentMapper documentMapper, OpenAiService openAiService) {
		this.documentMapper = documentMapper;
		this.openAiService = openAiService;
	}

	/**
	 * 목록. {@code in_progress} 인 행만 OpenAI 에 현재 상태를 다시 묻는다 -
	 * 완료·실패는 더 바뀌지 않으므로 전 행을 매번 조회하지 않는다.
	 */
	public List<DocumentResponse> list() {
		for (UUID id : documentMapper.findInProgressIds()) {
			documentMapper.findAliveById(id).ifPresent(doc -> {
				String current = openAiService.documentStatus(doc.vectorStoreId(), doc.openaiFileId());
				if (!current.equals(doc.status())) {
					documentMapper.updateStatus(doc.id(), current);
				}
			});
		}
		return documentMapper.listAlive().stream().map(AdminDocumentService::toResponse).toList();
	}

	/**
	 * 업로드. 검증 → OpenAI Files → Vector Store 연결 → DB 기록 순.
	 *
	 * <p>OpenAI 단계가 실패하면 예외가 올라와 <b>DB 행이 만들어지지 않는다.</b> 행만 생기고
	 * 스토어에는 없는 상태가 가장 나쁘다 - 화면에는 보이는데 검색에는 안 잡히고 지울 수도 없다.
	 */
	public DocumentResponse upload(UUID adminId, MultipartFile file) {
		if (!openAiService.hasSharedVectorStore()) {
			// 조용히 성공시키면 어디에도 안 들어간 문서가 목록에만 뜬다
			throw new BadRequestException("Vector Store 가 설정되지 않아 업로드할 수 없음 (OPENAI_VECTOR_STORE_ID)");
		}
		if (file == null || file.isEmpty()) {
			throw new BadRequestException("빈 파일");
		}
		String extension = ALLOWED.get(file.getContentType());
		if (extension == null) {
			throw new BadRequestException(
					"지원하지 않는 문서 형식: " + file.getContentType() + " (허용: PDF · TXT · MD · DOCX)");
		}
		byte[] bytes;
		try {
			bytes = file.getBytes();
		} catch (IOException e) {
			throw new BadRequestException("파일을 읽을 수 없음");
		}
		if (bytes.length > MAX_SIZE) {
			throw new BadRequestException("용량 초과(최대 " + (MAX_SIZE / MB) + "MB)");
		}
		// 검사할 수 있는 형식만 검사한다 - 나머지를 검사하는 척하지 않음
		if ("pdf".equals(extension) && !startsWith(bytes, PDF_MAGIC)) {
			throw new BadRequestException("파일 내용이 형식과 일치하지 않음");
		}

		String filename = file.getOriginalFilename() == null ? "문서." + extension : file.getOriginalFilename();
		UploadedDocument uploaded = openAiService.uploadDocument(filename, bytes, file.getContentType());

		UUID id = UUID.randomUUID();
		documentMapper.insert(new RagDocument(id, filename, uploaded.openaiFileId(), uploaded.vectorStoreId(),
				bytes.length, "in_progress", adminId, null, null));

		return documentMapper.listAlive().stream()
				.filter(d -> d.id().equals(id))
				.findFirst()
				.map(AdminDocumentService::toResponse)
				.orElseThrow(() -> new IllegalStateException("방금 넣은 문서를 다시 찾지 못함: " + id));
	}

	/**
	 * 삭제(소프트). OpenAI 정리가 실패해도 {@code deleted_at} 은 채운다.
	 *
	 * <p>실패를 이유로 목록에 남겨두면 관리자가 계속 지우기를 시도하는데, 그 사이 검색에서는
	 * 이미 빠져 있을 수 있어 상태가 더 헷갈린다. 고아 파일은 경고 로그로 남기고 별도로 정리한다 -
	 * 첨부 고아 회수와 같은 판단이다.
	 */
	public void delete(UUID documentId) {
		RagDocument doc = documentMapper.findAliveById(documentId)
				.orElseThrow(() -> new NotFoundException("문서 없음"));

		openAiService.deleteDocument(doc.vectorStoreId(), doc.openaiFileId());

		int deleted = documentMapper.softDelete(documentId, OffsetDateTime.now());
		if (deleted == 0) {
			// 조회와 삭제 사이에 누가 먼저 지웠음. 결과는 같으므로 오류로 올리지 않음
			log.warn("rag 문서 {} 가 이미 삭제돼 있었음", documentId);
		}
	}

	private static DocumentResponse toResponse(RagDocumentSummary d) {
		return new DocumentResponse(d.id(), d.filename(), d.byteSize(), d.status(),
				d.uploadedByName(), d.createdAt());
	}

	private static boolean startsWith(byte[] data, byte[] prefix) {
		if (data.length < prefix.length) {
			return false;
		}
		return Arrays.equals(data, 0, prefix.length, prefix, 0, prefix.length);
	}
}
