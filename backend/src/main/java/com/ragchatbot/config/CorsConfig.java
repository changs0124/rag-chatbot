package com.ragchatbot.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.ragchatbot.security.JwtAuthenticationFilter;

/**
 * CORS - 프론트(다른 출처)에서 API를 호출할 수 있게 허용. 허용 출처는 env로 제어.
 * JWT는 Authorization 헤더로 보내므로 credentials(쿠키)는 불필요.
 */
@Configuration
public class CorsConfig {

	@Bean
	CorsConfigurationSource corsConfigurationSource(
			@Value("${app.cors.allowed-origins:http://localhost:5173}") List<String> allowedOrigins) {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(allowedOrigins);
		config.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
		// 슬라이딩 재발급 토큰(FEAT-OPS-003). **등록하지 않으면 브라우저가 이 헤더를 자바스크립트에
		// 숨겨서, 서버는 정상 발급하는데 프론트는 못 읽고 조용히 아무 일도 안 일어남** - 실패가
		// 눈에 띄지 않는 형태라 케이스(TC-OPS-024)로 잠가 둠
		config.setExposedHeaders(List.of(JwtAuthenticationFilter.REFRESH_HEADER));
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", config);
		return source;
	}
}
