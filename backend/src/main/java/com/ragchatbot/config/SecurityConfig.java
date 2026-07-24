package com.ragchatbot.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;

import jakarta.servlet.DispatcherType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import com.ragchatbot.security.JwtAuthenticationFilter;

/**
 * 자체 이메일/비밀번호 + JWT stateless 인증.
 * permitAll : 회원가입/로그인/헬스. 그 외 /api/** 는 인증 필요(미인증 401).
 * P-3 소유권은 컨트롤러/서비스 코드가 별도 검증함.
 */
@Configuration
public class SecurityConfig {

	private final JwtAuthenticationFilter jwtFilter;

	public SecurityConfig(JwtAuthenticationFilter jwtFilter) {
		this.jwtFilter = jwtFilter;
	}

	@Bean
	SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
		http
				.csrf(csrf -> csrf.disable())
				.sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						// SSE 비동기 재디스패치 - 인증은 최초 REQUEST 디스패치에서 검사됨(async/error 재검사 방지)
						.dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll()
						.requestMatchers(HttpMethod.POST, "/api/auth/signup", "/api/auth/login").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/health").permitAll()
						// 파일 서빙은 서명 경로 토큰으로 검증(Bearer 불가한 <img src> 대응, M6/AC-22)
						.requestMatchers(HttpMethod.GET, "/api/files/**").permitAll()
						.anyRequest().authenticated())
				.exceptionHandling(e -> e.authenticationEntryPoint(
						(req, res, ex) -> res.sendError(401, "Unauthorized")))
				.httpBasic(b -> b.disable())
				.formLogin(f -> f.disable())
				.addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
		return http.build();
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder();
	}
}
