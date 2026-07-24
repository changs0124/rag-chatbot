package com.ragchatbot.web;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ragchatbot.security.CurrentUser;
import com.ragchatbot.service.ChatService;
import com.ragchatbot.web.dto.ChatDtos.ChatRequest;
import com.ragchatbot.web.dto.ChatDtos.ChatResponse;

/**
 * 채팅. Phase 4는 비스트리밍 JSON 응답, Phase 5에서 SSE 스트리밍으로 전환.
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

	private final ChatService chatService;

	public ChatController(ChatService chatService) {
		this.chatService = chatService;
	}

	@PostMapping
	public ChatResponse chat(@RequestBody ChatRequest req) {
		return chatService.chat(CurrentUser.id(), req);
	}
}
