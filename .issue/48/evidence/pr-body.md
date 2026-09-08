관련 이슈 #48

## 결론

**Spring Boot 3.5.16 → 4.1.1 로 올렸다. 동작은 바뀌지 않았다** — 184건이 전부 같은 단언으로 통과하고 응답 계약도 6필드 4곳 일치다.

## 예상과 실제가 달랐다

이슈에는 어려운 쪽으로 **Jakarta EE 11 · Servlet 6.1 전환**과 **직접 버전 박은 의존성 호환**을 적어 뒀다. 실제로는 **둘 다 거의 문제가 아니었다.** `java.version` 이 17 그대로여서 `javax` → `jakarta` 대공사가 없었고, `jakarta.servlet` 을 쓰는 3개 파일은 표준 API 만 써서 손댈 것이 없었다.

**진짜 작업은 Boot 4 의 모듈 분해를 따라가는 일이었다.** Boot 3 에서 `spring-boot-autoconfigure` 한 덩어리에 있던 자동설정이 기능별 모듈로 쪼개져서, **의존성에 없으면 조용히 자동설정만 사라진다.** 컴파일은 통과하므로 런타임에 가서야 드러난다.

### Flyway 가 정확히 그 함정이었다

```text
Caused by: org.postgresql.util.PSQLException: ERROR: relation "users" does not exist
[ERROR] Tests run: 184, Failures: 0, Errors: 126
```

`flyway-core` 는 그대로 있는데 마이그레이션을 돌려 줄 자동설정이 없어 **빈 스키마로 떴다.** 라이브러리가 클래스패스에 있으니 컴파일은 멀쩡히 통과했다. `spring-boot-starter-flyway` 로 바꿔 해결했다.

### 테스트 인프라는 두 단계로 걸렸다

`@SpringBootTest` 가 `TestRestTemplate` 을 더 이상 자동 제공하지 않는다.

1. 클래스 위치 이동 → `spring-boot-resttestclient` 모듈 + `@AutoConfigureTestRestTemplate`
2. 그 자동설정이 `RestTemplateBuilder` 를 참조 → `spring-boot-restclient` 도 테스트 스코프로 필요 (없으면 `ClassNotFoundException` 으로 컨텍스트가 안 떠서 또 126건이 죽는다)

**184건을 새 `RestTestClient` 로 갈아엎지 않았다.** 런타임 교체가 목적이지 테스트 재작성이 목적이 아니다.

## 버전 변화

| | 전 | 후 |
|---|---|---|
| `spring-boot-starter-parent` | 3.5.16 | **4.1.1** |
| `mybatis-spring-boot-starter` | 3.0.5 | **4.1.0** |
| `postgresql` | 42.7.13 수동 고정 | BOM 관리(=같은 값) · **고정 제거** |
| Jackson / JUnit / Testcontainers | 2.x / 5.x / 1.x | **3.1.5 / 6.0.3 / 2.0.5** |
| `java.version` | 17 | **17 그대로** |

**`postgresql.version` 고정을 뺐다.** CVE-2026-54291 때문에 `42.7.13` 을 박아 뒀는데 4.1.1 BOM 관리분이 정확히 같은 값이다. 남겨 두면 앞으로 BOM 이 더 올려도 우리가 낮은 값에 묶어 두게 되어 **원래 고정한 이유(보안)와 반대로 작동한다.**

## 손댄 것은 전부 import · 어노테이션 · 의존성 선언이다

| 파일 | 변경 |
|------|------|
| `backend/pom.xml` | 버전·아티팩트 개명·모듈 추가·고정 제거 |
| `BackendApplication.java` | import 1줄 — `UserDetailsServiceAutoConfiguration` 이 `boot.security.autoconfigure` 로 이동 |
| `OpenAiRealService.java` | import 2줄 — `com.fasterxml.jackson.databind` → `tools.jackson.databind`. **`ObjectMapper`·`JsonNode` API 가 그대로**라 본문 13곳은 손대지 않았다 |
| `AbstractPgIntegrationTest.java` | import 2줄 + 어노테이션 1개 |

**본문 로직을 고친 곳은 한 줄도 없다.**

## 검증

```text
[INFO] Tests run: 184, Failures: 0, Errors: 0, Skipped: 0   BUILD SUCCESS
케이스 수(backend) : 실측 184 / 하한 184                      OK
java : pom.xml java.version=17 / 실행 중=17.0.19              OK
✓ 응답 계약 4곳 일치 (6필드)
문서 참조 검사 통과
```

**응답 계약 게이트를 특히 봤다** — Jackson 을 갈면서 응답 JSON 필드 이름이 조용히 바뀌는 것이 이 작업의 가장 위험한 지점이었다.

## 검증되지 않은 경로 — 명시한다

`OpenAiRealService` 의 SSE 파싱(`JsonNode` 13곳)은 **`APP_MODE=live` 전용이라 mock 테스트가 밟지 않는다.** Jackson 3 에서 `JsonNode.path()` 계열 런타임 동작이 미묘하게 달라도 이 테스트 묶음으로는 드러나지 않는다.

- 확인한 것 : 컴파일 통과 · API 시그니처 동일 · 클래스 경로만 변경
- 확인 못 한 것 : 실제 OpenAI SSE 스트림 파싱
- 언제 : 실 OpenAI 키가 생긴 뒤 백로그 「높은 우선순위」의 실 연동 항목에서

**이 PR 이 만든 위험이 아니라 원래 mock 으로만 검증되던 경로다.** 다만 Jackson 교체가 그 경로를 지나가므로 적어 둔다.

## 완료 기준 대조

- [x] parent 가 4.1.x 로 올라감 — `4.1.1`
- [x] 직접 버전 박은 의존성 정리 — mybatis 4.1.0, `postgresql` 고정은 BOM 에 넘김, `java-jwt 4.6.0` 은 Spring 비의존이라 그대로 통과
- [x] `./mvnw clean verify` **184건 전부 통과** — 줄지 않음
- [x] `deps` · `docker` · `contract` 포함 게이트 통과 (CI 확인 예정)
- [x] **동작이 바뀐 지점 : 없음**
- [x] 런타임 버전 문서 6곳 갱신 · `check-runtime-versions.sh` 통과
- [x] `CHANGELOG.md` `[Unreleased]`

## 증거

- [업그레이드 전 기준선](../blob/main/.issue/48/evidence/before/현재버전-베이스라인.md)
- [업그레이드 후 측정](../blob/main/.issue/48/evidence/after/업그레이드후-측정.md)
