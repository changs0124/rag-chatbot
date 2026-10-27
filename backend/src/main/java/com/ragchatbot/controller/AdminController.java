package com.ragchatbot.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import jakarta.validation.Valid;

import com.ragchatbot.security.CurrentUser;
import com.ragchatbot.service.AdminAccessGuard;
import com.ragchatbot.service.AdminDocumentService;
import com.ragchatbot.service.AdminUserService;
import com.ragchatbot.dto.AdminDtos.AdminUserResponse;
import com.ragchatbot.dto.AdminDtos.CreateUserRequest;
import com.ragchatbot.dto.AdminDtos.DocumentResponse;
import com.ragchatbot.dto.AdminDtos.SyncResponse;
import com.ragchatbot.dto.AdminDtos.TemporaryPasswordResponse;

/**
 * 관리자 - RAG 문서 관리(FEAT-ADMIN-002) · 사용자 관리(FEAT-ADMIN-003 · 004).
 *
 * <p><b>인가는 메서드 본문 진입 시 확인하고, 관리자가 아니면 404 를 던진다</b>(P-3).
 * 403 을 쓰지 않는 이유는 관리 기능의 존재 자체를 드러내지 않기 위함이다.
 *
 * <p><b>감수하는 약점</b> : 인자 해석({@code @Valid @RequestBody} · {@code @PathVariable UUID} · multipart)이
 * 본문보다 먼저 돌아, 일반 사용자의 형식 오류는 404 가 아니라 400 을 받고 경로의 존재가 드러날 수 있다(#327).
 * 존재는 이미 다른 길(404 문구 차이 · 405 {@code Allow} · 프론트 번들의 경로 목록)로 드러나 있어 새로 새는 것이
 * 없으므로 허용한다. 인터셉터로 앞당기는 것은 이 이득에 비해 과하다.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

	private final AdminAccessGuard guard;
	private final AdminDocumentService documentService;
	private final AdminUserService userService;

	public AdminController(AdminAccessGuard guard, AdminDocumentService documentService,
			AdminUserService userService) {
		this.guard = guard;
		this.documentService = documentService;
		this.userService = userService;
	}

	@GetMapping("/documents")
	public List<DocumentResponse> listDocuments() {
		guard.requireAdmin(CurrentUser.id());
		return documentService.list();
	}

	@PostMapping("/documents")
	@ResponseStatus(HttpStatus.CREATED)
	public DocumentResponse uploadDocument(@RequestParam("file") MultipartFile file) {
		UUID adminId = CurrentUser.id();
		guard.requireAdmin(adminId);
		return documentService.upload(adminId, file);
	}

	/** 스토어와 동기화(#193). 공용 스토어에 있는데 살아 있는 행이 없는 파일을 행으로 넣는다 - 멱등 */
	@PostMapping("/documents/sync")
	public SyncResponse syncDocuments() {
		UUID adminId = CurrentUser.id();
		guard.requireAdmin(adminId);
		return documentService.sync(adminId);
	}

	@DeleteMapping("/documents/{id}")
	public ResponseEntity<Void> deleteDocument(@PathVariable UUID id) {
		guard.requireAdmin(CurrentUser.id());
		documentService.delete(id);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/users")
	public List<AdminUserResponse> listUsers() {
		guard.requireAdmin(CurrentUser.id());
		return userService.list();
	}

	@PostMapping("/users")
	@ResponseStatus(HttpStatus.CREATED)
	public TemporaryPasswordResponse createUser(@Valid @RequestBody CreateUserRequest req) {
		guard.requireAdmin(CurrentUser.id());
		return new TemporaryPasswordResponse(userService.create(req));
	}

	@PostMapping("/users/{id}/password-reset")
	public TemporaryPasswordResponse resetPassword(@PathVariable UUID id) {
		UUID adminId = CurrentUser.id();
		guard.requireAdmin(adminId);
		return new TemporaryPasswordResponse(userService.resetPassword(adminId, id));
	}

	@DeleteMapping("/users/{id}")
	public ResponseEntity<Void> deleteUser(@PathVariable UUID id) {
		guard.requireAdmin(CurrentUser.id());
		userService.delete(id);
		return ResponseEntity.noContent().build();
	}
}
