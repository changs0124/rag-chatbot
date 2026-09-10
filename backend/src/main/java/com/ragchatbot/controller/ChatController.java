package com.ragchatbot.controller;

import java.util.UUID;
import java.util.concurrent.ExecutorService;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.ragchatbot.security.CurrentUser;
import com.ragchatbot.service.ChatConcurrencyLimiter;
import com.ragchatbot.service.ChatService;
import com.ragchatbot.service.ChatService.PreparedChat;
import com.ragchatbot.service.RateLimiterService;
import com.ragchatbot.dto.ChatDtos.ChatRequest;

/**
 * 채팅 - SSE 스트리밍(meta→stage*→token*→citations→done).
 * 레이트리밋·검증은 동기로 먼저 처리(429/400/404를 정상 HTTP로), 그 후 비동기 스트리밍.
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

	private final ChatService chatService;
	private final RateLimiterService rateLimiter;
	private final ChatConcurrencyLimiter concurrency;
	private final ExecutorService chatExecutor;
	private final long sseTimeoutMs;

	public ChatController(ChatService chatService, RateLimiterService rateLimiter,
			ChatConcurrencyLimiter concurrency, ExecutorService chatExecutor,
			@Value("${app.chat.sse-timeout-ms:600000}") long sseTimeoutMs) {
		this.chatService = chatService;
		this.rateLimiter = rateLimiter;
		this.concurrency = concurrency;
		this.chatExecutor = chatExecutor;
		this.sseTimeoutMs = sseTimeoutMs;
	}

	@PostMapping
	public SseEmitter chat(@RequestBody ChatRequest req) {
		UUID userId = CurrentUser.id();
		// back-pressure : 동시 스트림 상한. **prepare 앞이어야 함** - prepare 가 사용자 메시지를
		// 저장하므로 뒤에서 거절하면 답변 없는 메시지가 대화에 남음(2026-07-28 결정)
		concurrency.acquire(userId);
		boolean handedOff = false;
		try {
			// **동시성 검사 뒤에 둔다**(#96). 레이트리밋은 비용 통제가 목적인데, 동시성 상한에 걸려
			// 되돌아간 요청은 모델을 부르지 않아 비용이 0 이다. 순서가 반대였을 때는 스트림이 도는
			// 중에 전송을 연타하면 전부 "이미 응답 중" 429 를 받으면서 분당 카운터만 올라, 스트림이
			// 끝난 뒤에도 그 분이 끝날 때까지 막혔다 - 유량 제어가 스스로를 무력화했다.
			// 여기서 던져도 아래 finally 가 자리를 반납하므로 추가 장치가 필요 없다
			rateLimiter.checkChat(userId); // AC-10 : 초과 시 429
			PreparedChat prepared = chatService.prepare(userId, req); // 400/404 동기 반환
			SseEmitter emitter = new SseEmitter(sseTimeoutMs); // P-5 : 타임아웃이 스트림 수명 단독 결정
			chatExecutor.execute(() -> {
				try {
					chatService.stream(userId, prepared, emitter);
				} finally {
					concurrency.release(userId);
				}
			});
			handedOff = true;
			return emitter;
		} finally {
			// 스트림 작업으로 넘기지 못한 경로(prepare 실패 · execute 거부)에서만 여기서 해제함.
			// 넘긴 뒤에는 작업의 finally 가 단독으로 해제하므로 이중 해제가 되지 않음
			if (!handedOff) {
				concurrency.release(userId);
			}
		}
	}
}
