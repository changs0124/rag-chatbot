package com.ragchatbot.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 얕은 liveness 헬스체크. 비인증 허용 경로(Phase 2 SecurityConfig에서 permitAll 예정).
 */
@RestController
public class HealthController {

	@GetMapping("/api/health")
	public Map<String, String> health() {
		return Map.of("status", "ok");
	}
}
