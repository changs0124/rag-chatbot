package com.ragchatbot.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.FilterChainProxy;

import com.ragchatbot.support.AbstractPgIntegrationTest;

import jakarta.servlet.DispatcherType;

/**
 * 컨테이너가 에러 페이지를 INCLUDE 로 부를 때 인가가 막지 않아야 한다(#517).
 *
 * <p>끊긴 SSE 의 비동기 오류는 응답이 이미 커밋돼 Tomcat 이 /error 를 forward 대신 INCLUDE 로 부른다. INCLUDE 가
 * 허용 목록에 없으면 AuthorizationFilter 가 거절하고, 커밋된 응답이라 401 도 못 써 ERROR 2줄이 남았다
 */
class IncludeDispatchPermitTest extends AbstractPgIntegrationTest {

	@Autowired
	private FilterChainProxy springSecurityFilterChain;

	@Test
	void container_include_of_the_error_page_is_not_denied() throws Exception {
		MockHttpServletRequest req = new MockHttpServletRequest("POST", "/error");
		req.setDispatcherType(DispatcherType.INCLUDE);
		AtomicBoolean reached = new AtomicBoolean();

		springSecurityFilterChain.doFilter(req, new MockHttpServletResponse(), (rq, rs) -> reached.set(true));

		assertThat(reached).isTrue();
	}

	@Test
	void client_request_to_a_protected_path_still_needs_a_token() throws Exception {
		MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/chat");
		MockHttpServletResponse res = new MockHttpServletResponse();
		AtomicBoolean reached = new AtomicBoolean();

		springSecurityFilterChain.doFilter(req, res, (rq, rs) -> reached.set(true));

		assertThat(reached).isFalse();
		assertThat(res.getStatus()).isEqualTo(401);
	}
}
