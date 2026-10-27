package com.ragchatbot.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;

import jakarta.servlet.DispatcherType;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.HeaderWriterFilter;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.AndRequestMatcher;
import org.springframework.security.web.util.matcher.DispatcherTypeRequestMatcher;

import com.ragchatbot.security.JwtAuthenticationFilter;

/**
 * 자체 이메일/비밀번호 + JWT stateless 인증.
 * permitAll : 로그인/헬스, 파일 서빙(GET /api/files/** - 서명 토큰으로 검증). 그 외 /api/** 는 인증 필요(미인증 401).
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
				.cors(cors -> {
				})
				.csrf(csrf -> csrf.disable())
				// 보안 헤더를 체인 앞에서 쓴다(#515). 기본값은 컨트롤러가 돌아온 뒤 요청 스레드에서 쓰는데, SSE 는 그때
				// 스트림 스레드가 응답을 커밋하고 있을 수 있어 두 스레드가 Tomcat 헤더 목록을 동시에 고친다 - 커밋 NPE 로
				// 헤더 0바이트인 채 SSE 타임아웃까지 멈췄다(Cloudflare 524)
				.headers(h -> h.withObjectPostProcessor(new ObjectPostProcessor<HeaderWriterFilter>() {
					@Override
					public <O extends HeaderWriterFilter> O postProcess(O filter) {
						filter.setShouldWriteHeadersEagerly(true);
						return filter;
					}
				}))
				.sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						// SSE 비동기 재디스패치 - 인증은 최초 REQUEST 디스패치에서 검사됨(async/error 재검사 방지)
						.dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll()
						// 커밋된 응답의 에러 페이지는 Tomcat 이 forward 대신 INCLUDE 로 부른다(끊긴 SSE, #517) - /error 로만 좁힌다
						.requestMatchers(new AndRequestMatcher(new DispatcherTypeRequestMatcher(DispatcherType.INCLUDE),
								PathPatternRequestMatcher.withDefaults().matcher("/error"))).permitAll()
						.requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/health").permitAll()
						// 파일 서빙은 서명 쿼리 토큰으로 검증(Bearer 불가한 <img src> 대응)
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
