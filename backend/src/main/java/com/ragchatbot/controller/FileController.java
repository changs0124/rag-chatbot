package com.ragchatbot.controller;

import java.util.UUID;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.ragchatbot.security.CurrentUser;
import com.ragchatbot.service.RateLimiterService;
import com.ragchatbot.service.FileService;
import com.ragchatbot.service.FileService.ServedFile;
import com.ragchatbot.dto.FileDtos.AttachmentResponse;

@RestController
@RequestMapping("/api/files")
public class FileController {

	private final FileService fileService;
	private final RateLimiterService rateLimiter;

	public FileController(FileService fileService, RateLimiterService rateLimiter) {
		this.fileService = fileService;
		this.rateLimiter = rateLimiter;
	}

	/** 업로드(인증 필요). message_id=null 상태로 저장(채팅 전송 시 연결) */
	@PostMapping
	public AttachmentResponse upload(@RequestParam("file") MultipartFile file) {
		// 초과 시 429(#95). 검사가 먼저여야 함 - upload 가 파일 전체를 힙에 올리므로,
		// 뒤에서 거절하면 거절할 요청의 메모리를 이미 다 쓴 뒤가 된다
		rateLimiter.checkUpload(CurrentUser.id());
		return fileService.upload(CurrentUser.id(), file);
	}

	/** 삭제(인증 필요, 소유자만) */
	@DeleteMapping("/{id}")
	public ResponseEntity<Void> delete(@PathVariable UUID id) {
		fileService.delete(CurrentUser.id(), id);
		return ResponseEntity.noContent().build();
	}

	/**
	 * 서빙(비인증 경로 - 서명 경로 토큰으로 검증, M6/AC-22).
	 * &lt;img src&gt;가 Authorization 헤더를 못 실으므로 쿼리 토큰을 씀.
	 */
	@GetMapping("/{id}")
	public ResponseEntity<Resource> serve(@PathVariable UUID id,
			@RequestParam(name = "token", required = false) String token) {
		ServedFile served = fileService.serve(id, token);
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(served.contentType()))
				.body(served.resource());
	}
}
