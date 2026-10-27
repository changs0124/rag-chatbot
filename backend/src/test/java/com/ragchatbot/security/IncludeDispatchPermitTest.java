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
import jakarta.servlet.RequestDispatcher;

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
		AtomicBoolean reached = new AtomicBoolean();

		springSecurityFilterChain.doFilter(include("/error"), new MockHttpServletResponse(), (rq, rs) -> reached.set(true));

		assertThat(reached).isTrue();
	}

	@Test
	void include_of_any_other_path_is_still_denied() throws Exception {
		MockHttpServletResponse res = new MockHttpServletResponse();
		AtomicBoolean reached = new AtomicBoolean();

		// 허용은 /error 로만 좁혔다 - 뒷날 누가 include 를 써도 보호 경로가 인가를 건너뛰지 않는다
		springSecurityFilterChain.doFilter(include("/api/conversations"), res, (rq, rs) -> reached.set(true));

		assertThat(reached).isFalse();
		assertThat(res.getStatus()).isEqualTo(401);
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

	/** Tomcat 의 INCLUDE 처럼 요청 URI 는 원래 경로 그대로, 대상은 include 속성에 둔다 */
	private static MockHttpServletRequest include(String target) {
		MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/chat");
		req.setDispatcherType(DispatcherType.INCLUDE);
		req.setAttribute(RequestDispatcher.INCLUDE_REQUEST_URI, target);
		req.setAttribute(RequestDispatcher.INCLUDE_SERVLET_PATH, target);
		return req;
	}
}
