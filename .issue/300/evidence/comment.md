## 작업 리포트 — 중복 합치기 · 설정 기본값 단일화

브랜치 `refactor/300-dedupe-and-yml-defaults` · 41파일 +185 / −151 · 동작 변화 없음

### 수치 (전 → 후)
| 지표 | 전 | 후 |
| --- | ---: | ---: |
| 기본값을 든 `@Value` | 34 | **0** |
| Bearer 헤더를 조립하는 곳(프론트 lib) | 3 | **1** (`authHeaders`) |
| `findInProgressIds`(N+1 경로) | 4 | **0** |
| 이메일 등 `trim().toLowerCase` 사본 | 5 | **2** (`EmailDomainPolicy.normalize` · 모드용 `AppModeGuard.normalize`) |

원본 : `.issue/300/evidence/{before,after}/counts.txt`

### 바꾼 것
- 백엔드
  - `@Value` 34곳의 기본값을 지우고 `application.yml` 만 정본. yml 에 없던 `app.file.access-token-ttl-minutes`(15, env `FILE_ACCESS_TOKEN_TTL_MINUTES`) 추가, 테스트 훅 `app.openai.base-url` · `app.mock.token-delay-ms` 는 env 없이 yml 에
  - yml 을 읽지 않는 `ApplicationContextRunner` 테스트 5건은 yml 값을 직접 깔고, 타임아웃 부등식 테스트는 **실제 yml 을 읽게** 했다(복사한 숫자로는 실제 기본값을 검사하지 못하므로)
  - `startsWith` → `FileService.regionEquals` 하나 · 이메일 정규화 `EmailDomainPolicy.normalize` 하나 · 명단 파싱 `AdminRoleSynchronizer.parse` 하나
  - 문서 상태 재조회 N+1 → `findInProgress()` 한 번, 업로드 응답은 `findSummaryById` 한 행
  - `CONVENTIONS.md` 「설정」에 「`@Value` 에 기본값을 다시 적지 않는다」
- 프론트 : `authHeaders()`, `useChat`(언마운트 정리 = `abortActiveStream`, 이력 로드 한 길), `findLast`, `ResizableSidebar.persist()`(갱신 함수 밖), `Markdown` 제목 렌더러 공유, `ChatPage` 새 대화 핸들러 하나
- **하지 않음** : 모달 틀 공통화(#105 §4)
- 남긴 기본값 : `@ConditionalOnExpression` 의 `${app.mode:}`(미설정 판정에 필요) · `@Scheduled` cron 1곳(`@Value` 아님)

### 검증
- `./mvnw clean verify` 286/286 · 프론트 oxlint · tsc · vitest 156/156 · build · 케이스 수 하한 양쪽 OK
- 실제 yml 로 jar 기동(임시 Postgres · mock) 6.3초, `/api/auth/me` 401 정상
- 문서 게이트 · 셸 구문 통과
