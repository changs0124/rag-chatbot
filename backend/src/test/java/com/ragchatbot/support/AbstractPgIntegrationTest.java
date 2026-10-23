package com.ragchatbot.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import com.ragchatbot.repository.UserRepository;

/**
 * 통합 테스트 공통 베이스 - 실 PostgreSQL(Testcontainers) + 계정 발급 헬퍼. Docker 필요.
 * 싱글턴 컨테이너 패턴 : 컨테이너를 static으로 1회만 시작해 모든 테스트 클래스가 공유함.
 * (@Container 를 클래스마다 쓰면 한 클래스 종료 시 컨테이너가 멈춰 캐시된 컨텍스트가 죽음)
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
// Boot 4 부터 @SpringBootTest 가 TestRestTemplate 을 자동으로 넣어 주지 않음 - 명시해야 함(#48)
@AutoConfigureTestRestTemplate
@TestPropertySource(properties = {
		// app.mode 는 기본값이 없어졌으므로 테스트도 명시해야 뜸(AppModeGuard)
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
		"app.file.orphan-cleanup-cron=-",
		// 설정이 다른 컨텍스트는 캐시에 남고 컨텍스트마다 풀이 연결을 붙잡는다. 기본 10 이면 컨텍스트 9개로
		// 공유 컨테이너 상한(97)에 닿아 순서에 따라 무관한 클래스가 「too many clients」로 기동에 실패했다(#343)
		"spring.datasource.hikari.maximum-pool-size=4" })
public abstract class AbstractPgIntegrationTest {

	// 태그와 다이제스트가 함께 있으면 호환성 검사가 저장소 이름을 「postgres:16-alpine」으로 읽어 거절한다(실측) - 공식 postgres 이미지이므로 명시한다
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
			DockerImageName.parse(composeDbImage()).asCompatibleSubstituteFor("postgres"));

	/** 앱이 접속하는 런타임 계정(#415). 운영과 같이 슈퍼유저가 아니고 DML 만 가진다 - 권한은 Flyway afterMigrate 가 준다 */
	protected static final String RUNTIME_USER = "ragapp";
	static final String RUNTIME_PASSWORD = "ragapp-test";

	static {
		POSTGRES.start(); // Ryuk가 JVM 종료 시 정리. 재시작/중단 없음
		createRuntimeRole();
	}

	/**
	 * 운영에서 운영자가 한 번 돌리는 계정 생성과 같은 모양이다(backend.md 「배포」). 모든 통합 테스트가 이 계정으로 돌아
	 * <b>런타임 권한이 앱에 충분한지</b>를 테스트 전체가 함께 증명한다. 스키마는 컨테이너 소유자(Flyway)가 만든다
	 */
	private static void createRuntimeRole() {
		try (var conn = POSTGRES.createConnection(""); var st = conn.createStatement()) {
			st.execute("create role " + RUNTIME_USER + " login nosuperuser nocreatedb nocreaterole password '"
					+ RUNTIME_PASSWORD + "'");
		} catch (java.sql.SQLException e) {
			throw new IllegalStateException("런타임 계정을 만들지 못함", e);
		}
	}

	/**
	 * 운영 compose 의 db 이미지(다이제스트 고정, #357)를 그대로 읽는다(#369).
	 * 움직이는 태그를 쓰면 실행하는 PC 의 캐시 · CI 러너가 pull 한 시점에 따라 검증하는 PostgreSQL 이 달라졌다.
	 * 값을 여기에 한 번 더 적지 않는 이유 - 두 곳에 두면 다이제스트를 올리는 커밋이 한쪽만 고쳐 조용히 갈린다.
	 * 테스트는 로컬 · CI 모두 backend/ 에서 돈다. 못 찾으면 태그로 떨어지지 않고 기동을 멈춘다
	 */
	static String composeDbImage() {
		Path compose = Path.of("..", "docker-compose.yml").toAbsolutePath().normalize();
		try {
			Matcher m = Pattern.compile("(?m)^\\s+image:\\s*(postgres:\\S+@sha256:[0-9a-f]{64})\\s*$")
					.matcher(Files.readString(compose));
			if (!m.find()) {
				throw new IllegalStateException(compose + " 에서 다이제스트 고정된 postgres image 줄을 못 찾음");
			}
			return m.group(1);
		} catch (IOException e) {
			throw new UncheckedIOException(compose + " 을 못 읽음 - 테스트는 backend/ 에서 실행해야 함", e);
		}
	}

	@DynamicPropertySource
	static void datasourceProps(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", () -> RUNTIME_USER);
		registry.add("spring.datasource.password", () -> RUNTIME_PASSWORD);
		// 마이그레이션만 소유자 계정으로 - 운영 compose 의 SPRING_FLYWAY_USER 와 같은 구성(#415)
		registry.add("spring.flyway.user", POSTGRES::getUsername);
		registry.add("spring.flyway.password", POSTGRES::getPassword);
	}

	@Autowired
	protected TestRestTemplate rest;

	@Autowired
	protected JdbcTemplate jdbc;

	@Autowired
	private PasswordEncoder passwordEncoder;

	@Autowired
	private UserRepository userRepository;

	/** 기동 러너가 만드는 뿌리 관리자. 계정 발급 API 를 부르려면 관리자 토큰이 먼저 있어야 한다 */
	protected static final String ROOT_ADMIN = "root@rag.test";

	private static final String ROOT_PASSWORD = "root-password-1";

	/**
	 * 계정 발급 후 그 계정의 JWT 반환(FEAT-AUTH-001).
	 *
	 * <p><b>실제 발급 경로를 그대로 탄다</b> - 관리자로 로그인해 {@code POST /api/admin/users} 를 부르고,
	 * 돌려받은 임시 비밀번호로 다시 로그인한다. DB 에 행을 직접 넣으면 빠르지만, 그러면 이 베이스를 쓰는 통합 테스트가
	 * 전부 발급 로직을 **한 번도 밟지 않는다.**
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

	/** 계정을 발급하고 관리자로 올린 뒤 토큰을 돌려준다. 승격은 기동 러너와 같은 저장소 경로를 탄다 */
	protected String createAdminUser(String email) {
		String token = createUser(email);
		userRepository.promoteAdmins(List.of(email));
		return token;
	}

	/**
	 * 대화를 하나 만들고 ID 를 돌려준다. 제목은 어느 케이스도 보지 않는다.
	 * 상태를 여기서 단언한다 - 만들기가 실패하면 뒤에서 null 본문 NPE 로 터져 원인과 멀어진다
	 */
	@SuppressWarnings("rawtypes")
	protected String createConversation(String token) {
		var res = rest.exchange("/api/conversations", HttpMethod.POST,
				new HttpEntity<>(Map.of("title", "대화"), bearer(token)), Map.class);
		assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
		return (String) res.getBody().get("id");
	}

	protected HttpHeaders bearer(String token) {
		var h = new HttpHeaders();
		h.setBearerAuth(token);
		return h;
	}
}
