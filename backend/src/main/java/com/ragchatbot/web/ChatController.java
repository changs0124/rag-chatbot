package com.ragchatbot.web;

import java.util.UUID;
import java.util.concurrent.ExecutorService;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.ragchatbot.security.CurrentUser;
import com.ragchatbot.service.ChatService;
import com.ragchatbot.service.ChatService.PreparedChat;
import com.ragchatbot.service.RateLimiterService;
import com.ragchatbot.web.dto.ChatDtos.ChatRequest;

/**
 * 채팅 - SSE 스트리밍(meta→token→citations→done).
 * 레이트리밋·검증은 동기로 먼저 처리(429/400/404를 정상 HTTP로), 그 후 비동기 스트리밍.
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

	private final ChatService chatService;
	private final RateLimiterService rateLimiter;
	private final ExecutorService chatExecutor;
	private final long sseTimeoutMs;

	public ChatController(ChatService chatService, RateLimiterService rateLimiter, ExecutorService chatExecutor,
			@Value("${app.chat.sse-timeout-ms:600000}") long sseTimeoutMs) {
		this.chatService = chatService;
		this.rateLimiter = rateLimiter;
		this.chatExecutor = chatExecutor;
		this.sseTimeoutMs = sseTimeoutMs;
	}

	@PostMapping
	public SseEmitter chat(@RequestBody ChatRequest req) {
		UUID userId = CurrentUser.id();
		rateLimiter.checkChat(userId); // AC-10 : 초과 시 429
		PreparedChat prepared = chatService.prepare(userId, req); // 400/404 동기 반환
		SseEmitter emitter = new SseEmitter(sseTimeoutMs); // P-5 : 타임아웃이 스트림 수명 단독 결정
		chatExecutor.execute(() -> chatService.stream(userId, prepared, emitter));
		return emitter;
	}
}
