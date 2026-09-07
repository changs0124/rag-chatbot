package com.ragchatbot.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ragchatbot.security.CurrentUser;
import com.ragchatbot.service.ConversationService;
import com.ragchatbot.dto.ConversationDtos.ConversationResponse;
import com.ragchatbot.dto.ConversationDtos.CreateConversationRequest;
import com.ragchatbot.dto.ConversationDtos.MessageResponse;
import com.ragchatbot.dto.ConversationDtos.RenameConversationRequest;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

	private final ConversationService conversationService;

	public ConversationController(ConversationService conversationService) {
		this.conversationService = conversationService;
	}

	@PostMapping
	public ConversationResponse create(@RequestBody(required = false) CreateConversationRequest req) {
		String title = (req == null) ? null : req.title();
		return conversationService.create(CurrentUser.id(), title);
	}

	@GetMapping
	public List<ConversationResponse> list() {
		return conversationService.list(CurrentUser.id());
	}

	@PatchMapping("/{id}")
	public ConversationResponse rename(@PathVariable UUID id, @Valid @RequestBody RenameConversationRequest req) {
		return conversationService.rename(CurrentUser.id(), id, req.title());
	}

	@GetMapping("/{id}/messages")
	public List<MessageResponse> messages(@PathVariable UUID id) {
		return conversationService.messages(CurrentUser.id(), id);
	}

	@DeleteMapping("/{id}")
	public ResponseEntity<Void> delete(@PathVariable UUID id) {
		conversationService.delete(CurrentUser.id(), id);
		return ResponseEntity.noContent().build();
	}
}
