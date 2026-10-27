package com.ragchatbot.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.FilterChainProxy;

import com.ragchatbot.support.AbstractPgIntegrationTest;

/**
 * 보안 헤더는 컨트롤러가 돌기 <b>전에</b> 응답에 쓰여 있어야 한다(#515).
 *
 * <p>기본값(나중에 쓰기)이면 HeaderWriterFilter 가 컨트롤러가 돌아온 뒤 요청 스레드에서 헤더를 쓴다. SSE 는 그때
 * 스트림 스레드가 이미 meta 를 쓰며 응답을 커밋하고 있을 수 있어, 두 스레드가 Tomcat 의 헤더 목록을 동시에 고친다 -
 * 운영에서 커밋 NPE(응답 헤더 0바이트 · 10분 정지 · Cloudflare 524)와 「malformed MIME header」 502 로 관찰됐다.
 * 경합 자체는 재현이 드물어, 그 전제인 <b>쓰는 시점</b>을 고정한다
 */
class SecurityHeadersEagerTest extends AbstractPgIntegrationTest {

	@Autowired
	private FilterChainProxy springSecurityFilterChain;

	@Test
	void security_headers_are_written_before_the_handler_runs() throws Exception {
		MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/auth/login");
		MockHttpServletResponse res = new MockHttpServletResponse();
		AtomicReference<String> seenByHandler = new AtomicReference<>();

		// 체인 끝 = 컨트롤러 자리. 여기서 이미 헤더가 보여야 컨트롤러 뒤 요청 스레드가 응답을 다시 건드리지 않는다
		springSecurityFilterChain.doFilter(req, res,
				(rq, rs) -> seenByHandler.set(res.getHeader("X-Content-Type-Options")));

		assertThat(seenByHandler.get()).isEqualTo("nosniff");
	}
}
