# Backend Architecture

Java 17 + Spring Boot 3.5.16 + MyBatis 3.0.5 + PostgreSQL(Flyway). 단일 인스턴스 전제.
전체 시스템 그림·엔드포인트 목록·운영 파라미터는 [overview](./overview.md)에 있다. 여기서는 API 설계 원칙과 DB 스키마를 다룬다.

## 레이어

```
web/          HTTP 경계만 (@RestController). 비즈니스 로직 없음
  dto/        요청·응답 record. AuthDtos 처럼 한 파일에 묶음
service/      오케스트레이션 · 트랜잭션 경계
mapper/       MyBatis 인터페이스. SQL 은 resources/mapper/*.xml
domain/       DB 행에 대응하는 record
openai/       외부 LLM 호출 경계 (인터페이스 + Mock/Real)
security/     JWT 발급·검증 · 파일 서명 토큰 · 현재 사용자
storage/      파일 저장 추상화 (FileStorage + LocalFileStorage)
config/       Security · CORS · Executor · 기동 가드
error/        ApiExceptions + GlobalExceptionHandler
```

## API 설계 원칙

- **컨트롤러는 얇게.** `@Valid` 검증 → 서비스 호출 → DTO 반환. 사용자 식별은 `CurrentUser.id()`.
- **상태 코드를 컨트롤러가 만들지 않는다.** 서비스가 도메인 예외를 던지고 `GlobalExceptionHandler` 가 단독으로 매핑한다.
  삭제류만 `ResponseEntity.noContent()` 를 직접 쓴다.
- **소유권 위반은 403 이 아니라 404 로 은닉한다.** 남의 리소스는 "없는 것"으로 보인다.
  검증은 조회 단계에서 `findByIdAndUser(...)` 형태로 막는다 — DB RLS 가 없으므로 애플리케이션 코드가 유일한 관문이다.
- **응답 본문은 `ApiError(code, message)` 로 통일한다.** 프론트는 `message` 를 그대로 노출한다.

### 예외 → 상태 매핑

| 예외 | 상태 | code |
|------|------|------|
| `MethodArgumentNotValidException` | 400 | `BAD_REQUEST` |
| `BadRequestException` | 400 | `BAD_REQUEST` |
| `UnauthorizedException` | 401 | `UNAUTHORIZED` |
| `NotFoundException` | 404 | `NOT_FOUND` |
| `ConflictException` | 409 | `CONFLICT` |
| `MaxUploadSizeExceededException` | 413 | `PAYLOAD_TOO_LARGE` |
| `RateLimitException` | 429 | `RATE_LIMIT` |

## 인증

자체 이메일/비밀번호 + JWT stateless(HS256, `aud=auth`). 비밀번호는 BCrypt 해시로만 저장한다.

- **이메일은 소문자로 정규화**해 저장·조회하고, DB 에도 `lower(email)` 유일 인덱스를 둔다(V2).
  앱을 우회한 삽입까지 막아 "가입했는데 로그인이 안 되는" 상태를 없앤다.
- **비밀번호 변경 시각(`password_changed_at`)이 토큰 무효화 기준선이다.** stateless JWT 는 서버가 회수할 수 없어,
  매 인증 요청마다 사용자 행을 읽어 `iat` 와 대조한다. 눈금은 **초** — `iat` 가 초 단위로 내림되므로 기준선도 같아야
  변경 직후 발급분이 밀리초 차이로 거부되지 않는다.
- **파일 서빙 토큰은 분리된 audience(`aud=file`)** 다. `<img src>` 가 `Authorization` 헤더를 못 실어 쿼리 토큰을 쓰는데,
  audience 를 나누지 않으면 짧은 수명의 파일 토큰이 인증 Bearer 로 통용된다. TTL 15분, `subject=fileId` 일치까지 확인한다.
- permitAll 은 회원가입·로그인·헬스·파일 서빙뿐이다. SSE 비동기 재디스패치(`ASYNC`/`ERROR`)도 통과시킨다 —
  인증은 최초 `REQUEST` 디스패치에서 이미 검사됐다.

## 채팅 SSE 계약

`ChatController` → `ChatService` 가 지키는 순서 : `meta → stage* → token* → citations → done` (또는 `error`).

- **검증은 동기, 스트리밍은 비동기.** 레이트리밋(429) · 동시성 상한(429) · 검증(400/404)은 SSE 안의 이벤트가 아니라
  **정상 HTTP 응답**으로 나간다. 스트림이 열린 뒤에는 상태 코드를 바꿀 수 없기 때문이다.
- **동시성 상한은 `prepare` 앞에서 잡는다.** `prepare` 가 사용자 메시지를 저장하므로, 뒤에서 거절하면 답변 없는
  메시지가 대화에 남는다.
- **스트림 수명은 SSE emitter 타임아웃이 단독으로 정한다**(기본 10분). MVC async 타임아웃은 꺼 둔다.
- **중단(사용자 정지·연결 끊김)은 실패가 아니다.** 받은 데까지 `status=complete` + `stopped=true` 로 저장한다.
  인용은 스트림 끝에 오므로 중단 시점에는 늘 0건이며, `stopped` 가 없으면 무자료 배너가 거짓으로 붙는다.
- **저장 텍스트는 화면에 닿은 것과 같다.** 토큰을 보낸 **뒤에** 버퍼에 담아, 전송 실패한 토큰은 남기지 않는다.
- **진행 단계 라벨 문자열은 LLM 구현이 소유한다.** `ChatService` 는 실행 모드를 알지 못한다. 목업은 목업임이
  드러나는 전용 문구를 쓴다.
- **조회 단계 라벨은 실제로 참조한 자료명을 밝힌다.** 그 이름은 화면 하단 출처 목록과 **같은 값**
  (`CitationData.sourceName`)에서 파생한다 — 따로 문자열을 두면 진행 문구가 말한 자료와 실제로 붙는 출처가
  언젠가 어긋나고, 그 어긋남 자체가 거짓 표시가 된다. 참조한 자료가 없거나(무자료) 그 시점에 아직 알 수 없으면
  (라이브의 `file_search` 시작 시점) 이름을 붙이지 않는다. 없는 이름을 지어내지 않는다.

### 대화 이력

같은 대화의 이전 턴을 함께 보낸다. **이력의 정본은 우리 DB** 이며, provider 쪽 상태
(Responses API 의 `previous_response_id` 등)에 맡기지 않는다 — 맡기면 `OpenAiService` 경계의
Mock/Real 파리티가 깨지고 이력의 정본이 두 군데로 갈린다.

자르는 규칙(`ChatService.buildHistory`) :

- **개수가 아니라 토큰 예산**(`app.chat.history-token-budget`, 기본 6000)으로 자른다. 메시지 길이 편차가
  커서 "최근 N개"는 턴당 비용을 예측하지 못한다 — 같은 N 이 어떤 대화에서는 수백 토큰이고 어떤 대화에서는
  수만 토큰이 된다.
- 최신부터 채우다 예산을 넘기면 **거기서 멈춘다.** 중간을 건너뛰고 더 오래된 짧은 메시지를 주워 담으면
  대화가 끊긴 채 전달돼 모델이 없는 맥락을 지어낸다.
- **과거 이미지는 재전송하지 않는다.** 이미지 하나가 수천 토큰이라 턴이 쌓일수록 비용이 폭증한다.
  대신 `(이미지 첨부)` 자리표시자를 남겨 "그때 첨부가 있었다"는 사실은 잃지 않는다. 구조화된 비전 입력은
  **이번 턴에만** 쓴다.
- `status=error` 는 답변이 아니므로 제외한다. `stopped=true`(사용자가 중단)는 사용자가 실제로 본
  내용이라 포함한다.
- 이력은 **새 사용자 메시지를 저장하기 전에** 읽는다. 저장 후 읽으면 방금 보낸 메시지가 이력에 섞여
  같은 말이 두 번 전달된다.

토큰 수는 문자 수 기반 근사(한국어 기준 1.5자당 1토큰)다. 정확한 토크나이저를 붙이지 않는 이유는 이 값이
하드 한도가 아니라 **예산 가드**이기 때문이며, 영어에서 과대평가되는 방향은 이력이 짧아지는 쪽이라 안전하다.
- 스트리밍 구간에서는 DB 커넥션을 잡지 않는다. 저장은 `ChatPersistenceService` 가 메시지·출처·touch 를
  **한 트랜잭션**으로 처리한다.

## 유량 제어

| 장치 | 재는 것 | 기본값 |
|------|---------|--------|
| `RateLimiterService` | 사용자별 **분당 횟수**(채팅) · 계정별 분당 로그인 시도 | 20 / 10 |
| `ChatConcurrencyLimiter` | **지금 열려 있는 스트림 수**(전역 · 사용자별) | 8 / 1 |

둘은 다른 것을 잰다 — 서로 다른 사용자가 한 번씩만 보내도 풀은 포화되므로 횟수 상한만으로는 막히지 않는다.
전역 상한은 `chatExecutor` 풀 크기와 **같은 프로퍼티**를 쓴다. 갈리면 초과분이 큐에 쌓여 응답 한 바이트 없이
SSE 타임아웃까지 기다리게 된다.

레이트리밋 카운터는 키 총량 상한 + LRU 축출로 메모리를 유계로 둔다. **축출은 곧 카운터 리셋**이라는 약화가 따르며,
사유는 [overview](./overview.md) 「알려진 제약」에 있다.

## DB 스키마

스키마의 소유자는 **Flyway 마이그레이션 SQL** 이다. 앱 코드가 `alter` 하지 않는다.
새 변경은 `backend/src/main/resources/db/migration/` 에 파일을 추가하고, 기존 마이그레이션은 수정하지 않는다.

| 마이그레이션 | 내용 |
|--------------|------|
| `V1__init.sql` | `users` · `conversations` · `messages` · `citations` · `attachments` + 인덱스 + `updated_at` 트리거 |
| `V2__auth_hardening.sql` | 이메일 소문자 정규화 + `lower(email)` 유일 인덱스, `password_changed_at` 추가 |
| `V3__message_stopped.sql` | `messages.stopped` 추가(소급 보정 없음) |

테이블별 컬럼과 관계(ERD)는 [overview](./overview.md) 「데이터 모델」에 있다. 설계상 짚을 점만 적는다.

- 모든 PK 는 `uuid`(`gen_random_uuid()`). MyBatis 는 `UuidTypeHandler` 로 매핑하고,
  snake_case 컬럼 ↔ camelCase 프로퍼티는 `map-underscore-to-camel-case` 가 처리한다.
- `messages.status` 는 `complete | error` 만 갖는다. `streaming` 은 DB 에 없는 프론트 로컬 상태다.
- `citations` 는 출처를 **영속화**한다. SSE 로만 보내면 재조회 시 각주가 사라진다.
- `attachments.message_id` 는 nullable 이다 — 업로드 시점엔 메시지가 없다. 소유는 `user_id` 기준이고,
  연결되지 않은 채 남은 첨부는 스케줄러가 회수한다.
- 재조회 질의는 **대화 단위로 한 번씩** 읽는다(`findByConversation`). 메시지마다 도는 형태는 메시지 수만큼
  질의가 나가므로 쓰지 않는다.

## 파일

- 업로드 검증 순서 : MIME 허용목록 → 타입별 용량 → **매직바이트**. webp 는 RIFF 뒤 오프셋 8의 `WEBP` 마커까지 본다.
- **이미지만 받는다.** 문서(PDF)는 업로드·표시는 되는데 모델에 전달되지 않아 "그 PDF 를 근거로 답했다"는 오해를
  만들었다. 실제 근거로 쓰려면 실 키 검증이 필요하므로 지금은 **받지 않는 것**을 계약으로 한다.
- 저장 경로는 서버가 소유한다(`{userId}/{uuid}.{ext}`). 경로 탈출은 정규화 후 루트 하위인지로 막는다.
- 회수는 두 패스다 — 행 기준(`message_id is null`)과 저장소 스캔(파일은 있는데 행이 없음).
  대화 삭제 시 cascade 로 행이 먼저 사라지면 1차가 구조적으로 못 보기 때문이다.
  둘 다 최소 유예(10분)보다 최근 것은 어떤 cutoff 로도 지우지 않는다.

## 실행 모드

`app.mode` 는 **기본값이 없다.** 미설정이면 `AppModeGuard` 가 기동을 막는다 — 목업이 우연히 켜지는 경로를 없앴다.
`mock` 과 `live` 는 `@ConditionalOnProperty` 로 `OpenAiService` 구현 하나만 로드한다.
`prod` 프로필 + `mock` 조합도 거부한다.

설정값은 `backend/src/main/resources/application.yml` 에 `${ENV:기본값}` 으로 두고, 위험한 값
(`app.mode` · `app.jwt.secret`)은 **일부러 기본값을 비워** 기동에 실패하게 한다.

## 배포

호스트가 정해지지 않았으므로 특정 PaaS 형식 대신 **컨테이너 하나**(`backend/Dockerfile`)로 둔다.
Railway · Render · Fly · Cloud Run 등이 그대로 받는다. 리슨 포트는 `PORT` 환경변수를 따르므로
플랫폼이 주입하는 포트에 자동으로 맞는다.

필요한 환경변수와 각 값의 의미는 `backend/.env.example` 에 있다. 배포 시 반드시 확인할 것 :

| 항목 | 빠뜨리면 |
|------|----------|
| `APP_MODE` | **기동 실패**(의도된 동작). `mock` 이면 키 없이 전 경로가 돈다 |
| `JWT_SECRET` | 기동 실패 |
| `DB_URL` · `DB_USERNAME` · `DB_PASSWORD` | 기동 실패. URL 은 `jdbc:postgresql://…` 형식이어야 함 — 관리형 DB 가 주는 `postgres://…` 를 그대로 넣으면 뜨지 않음 |
| `ALLOWED_ORIGINS` | 기동은 되지만 **브라우저가 모든 API 호출을 CORS 로 차단**해 화면이 전부 실패 |
| `OPENAI_API_KEY` | `live` 에서만 필요. `live` 인데 비면 기동 실패(fail-fast) |
| `OPENAI_VECTOR_STORE_ID` | 기동·응답은 되지만 file_search 없이 답해 **출처가 늘 0건**(전부 "자료 없음") |

**첨부 파일은 로컬 디스크에 저장한다.** 컨테이너가 갈리면 사라지므로 `FILE_STORAGE_ROOT` 에
영속 볼륨을 붙여야 한다(이미지 기본값 `/data/uploads`). 볼륨을 붙일 수 없는 환경이면
`FileStorage` 구현을 S3 등으로 교체해야 한다.

스키마는 기동 시 Flyway 가 적용하므로 별도 마이그레이션 단계가 필요 없다.
헬스체크 경로는 `GET /api/health`(인증 불필요)다.

## 테스트

통합 테스트는 Testcontainers 로 **실 PostgreSQL** 을 띄운다(`AbstractPgIntegrationTest`). H2 로 대체하지 않는다 —
`gen_random_uuid()` · `timestamptz` · 트리거 · `lower(email)` 표현식 유일 인덱스가 실물과 갈린다.
현재 104 케이스이며 하한은 `scripts/case-floors.env` 가 잠근다. 로컬 실행에 Docker 가 필요하다.

통합 테스트는 **고아 회수 크론을 꺼 둔다**(`app.file.orphan-cleanup-cron=-`). `@EnableScheduling` 이 켜져 있어
그냥 두면 테스트 도중 매시 정각에 실제로 발화하는데, 회수 대상이 DB 행과 공유 저장소 디렉터리라 결과가
실행 시각에 따라 갈린다. 스케줄러 자체는 `OrphanCleanupSchedulerTest` 가 결정적으로 검증한다.
