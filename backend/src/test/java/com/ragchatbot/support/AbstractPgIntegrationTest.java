package com.ragchatbot.support;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * 통합 테스트 공통 베이스 - 실 PostgreSQL(Testcontainers) + 계정 발급 헬퍼. Docker 필요.
 * 싱글턴 컨테이너 패턴 : 컨테이너를 static으로 1회만 시작해 모든 테스트 클래스가 공유함.
 * (@Container 를 클래스마다 쓰면 한 클래스 종료 시 컨테이너가 멈춰 캐시된 컨텍스트가 죽음)
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
// Boot 4 부터 @SpringBootTest 가 TestRestTemplate 을 자동으로 넣어 주지 않음 - 명시해야 함(#48)
@AutoConfigureTestRestTemplate
@TestPropertySource(properties = {
		// app.mode 는 기본값이 없어졌으므로 테스트도 명시해야 뜸(AC-18, AppModeGuard)
		"app.mode=mock",
		// 뿌리 관리자. 기동 러너가 이 명단을 보고 계정을 만든다 - 테스트에서 계정이 태어나는 유일한 지점이다.
		// 명단을 덮어쓰는 하위 테스트는 이 주소를 **함께** 넣어야 한다. 빼면 기동 동기화가 강등시켜
		// 발급 API 가 404 로 막히고, 원인이 테스트 본문 어디에도 보이지 않는다
		"app.admin.emails=root@rag.test",
		"app.jwt.secret=test-secret-please-change-0123456789abcdef",
		"app.ratelimit.chat-per-minute=5",
		"app.ratelimit.login-per-minute=3",
		"app.mock.token-delay-ms=0",
		// 고아 회수 크론을 끔("-" = Scheduled.CRON_DISABLED). @EnableScheduling 이 켜져 있어
		// 그냥 두면 테스트 중 매시 정각에 실제로 발화함 - 회수 대상은 DB 행과 **공유 저장소 디렉터리**라,
		// 정각을 넘겨 도는 회차에서만 FileFlowTest 의 늙힌 파일(2시간 전)을 스케줄러가 먼저 지우거나
		// Files.walk 가 동시 삭제와 겹쳐 터졌음. 스케줄러 자체 검증은 OrphanCleanupSchedulerTest 가 함
		"app.file.orphan-cleanup-cron=-" })
public abstract class AbstractPgIntegrationTest {

	static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

	static {
		POSTGRES.start(); // Ryuk가 JVM 종료 시 정리. 재시작/중단 없음
	}

	@DynamicPropertySource
	static void datasourceProps(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::getUsername);
		registry.add("spring.datasource.password", POSTGRES::getPassword);
	}

	@Autowired
	protected TestRestTemplate rest;

	@Autowired
	protected JdbcTemplate jdbc;

	@Autowired
	private PasswordEncoder passwordEncoder;

	/** 기동 러너가 만드는 뿌리 관리자. 계정 발급 API 를 부르려면 관리자 토큰이 먼저 있어야 한다 */
	protected static final String ROOT_ADMIN = "root@rag.test";

	private static final String ROOT_PASSWORD = "root-password-1";

	/**
	 * 계정 발급 후 그 계정의 JWT 반환(FEAT-AUTH-001).
	 *
	 * <p><b>실제 발급 경로를 그대로 탄다</b> - 관리자로 로그인해 {@code POST /api/admin/users} 를 부르고,
	 * 돌려받은 임시 비밀번호로 다시 로그인한다. DB 에 행을 직접 넣으면 빠르지만, 그러면 16개 테스트
	 * 파일이 전부 발급 로직을 **한 번도 밟지 않는다.**
	 */
	protected String createUser(String email) {
		return login(email, issueAccount(email));
	}

	/** 계정을 발급하고 <b>임시 비밀번호</b>를 돌려준다. 그 값으로 직접 로그인해야 하는 케이스가 쓴다 */
	@SuppressWarnings("rawtypes")
	protected String issueAccount(String email) {
		return (String) issueRaw(email, "사용자").getBody().get("temporaryPassword");
	}

	/** 발급 응답을 그대로 돌려준다. 거절·중복처럼 <b>상태 코드가 관심사</b>인 케이스가 쓴다 */
	@SuppressWarnings("rawtypes")
	protected ResponseEntity<Map> issueRaw(String email, String name) {
		return rest.exchange("/api/admin/users", HttpMethod.POST,
				new HttpEntity<>(Map.of("email", email, "name", name), bearer(rootToken())), Map.class);
	}

	@SuppressWarnings("rawtypes")
	protected String login(String email, String password) {
		var res = rest.postForEntity("/api/auth/login",
				Map.of("email", email, "password", password), Map.class);
		return (String) res.getBody().get("token");
	}

	/**
	 * 뿌리 관리자 토큰. 계정 자체는 기동 러너가 만들었고, 그 임시 비밀번호는 기동 로그에만 있다.
	 * 테스트는 로그를 읽는 대신 <b>아는 값으로 덮는다</b> - 계정이 태어나는 경로는 여전히 러너 하나뿐이다.
	 */
	private String rootToken() {
		// 역할까지 되돌린다 - 강등을 검증하는 케이스(AdminRoleSyncFlowTest)가 뿌리 관리자까지 내려버리고,
		// 그 뒤 다른 케이스의 발급이 404 로 막히면 실패 지점이 원인에서 멀어진다
		jdbc.update("update users set password_hash = ?, role = 'admin' where email = ?",
				passwordEncoder.encode(ROOT_PASSWORD), ROOT_ADMIN);
		return login(ROOT_ADMIN, ROOT_PASSWORD);
	}

	protected HttpHeaders bearer(String token) {
		var h = new HttpHeaders();
		h.setBearerAuth(token);
		return h;
	}
}
