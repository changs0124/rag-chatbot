package com.ragchatbot.web;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.ragchatbot.security.CurrentUser;
import com.ragchatbot.service.AdminAccessGuard;
import com.ragchatbot.service.AdminDocumentService;
import com.ragchatbot.service.AdminUserService;
import com.ragchatbot.web.dto.AdminDtos.AdminUserResponse;
import com.ragchatbot.web.dto.AdminDtos.DocumentResponse;
import com.ragchatbot.web.dto.AdminDtos.TemporaryPasswordResponse;

/**
 * 관리자 - RAG 문서 관리(FEAT-ADMIN-002) · 사용자 관리(FEAT-ADMIN-003).
 *
 * <p><b>모든 경로가 먼저 관리자 여부를 확인하고, 아니면 404 를 던진다</b>(P-3).
 * 403 을 쓰지 않는 이유는 관리 기능의 존재 자체를 드러내지 않기 위함이다.
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

	@PostMapping("/users/{id}/password-reset")
	public TemporaryPasswordResponse resetPassword(@PathVariable UUID id) {
		UUID adminId = CurrentUser.id();
		guard.requireAdmin(adminId);
		return new TemporaryPasswordResponse(userService.resetPassword(adminId, id));
	}
}
