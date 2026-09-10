# Backend Architecture

Java 17 + Spring Boot 4.1.1 + MyBatis 4.1.0 + PostgreSQL(Flyway). 단일 인스턴스 전제.
전체 시스템 그림과 운영 파라미터는 [overview](./overview.md), 엔드포인트 계약은 [api.md](../01_specs/api.md) 에 있다.
여기서는 API 설계 원칙과 DB 스키마를 다룬다.

## 레이어

```
controller/   HTTP 경계만 (@RestController). 비즈니스 로직 없음
dto/          요청·응답 record. AuthDtos 처럼 한 파일에 묶음
service/      오케스트레이션 · 트랜잭션 경계
repository/   MyBatis 인터페이스. SQL 은 resources/mapper/*.xml
entity/       DB 행에 대응하는 record
openai/       외부 LLM 호출 경계 (인터페이스 + Mock/Real)
security/     JWT 발급·검증 · 파일 서명 토큰 · 현재 사용자
storage/      파일 저장 추상화 (FileStorage + LocalFileStorage)
config/       Security · CORS · Executor · 기동 가드
exception/    ApiExceptions + GlobalExceptionHandler
```

- **조회 전용 매핑은 예외다.** 조인 결과를 그대로 돌려주는 목록 조회는 `repository` 가 `dto` 의
  Response 를 **직접** 매핑할 수 있다. MyBatis 는 JPA 와 달리 `resultMap` 에 임의 타입을 지정할 수 있어
  중간 엔티티가 필요 없다. 현재 그렇게 하는 것은 `RagDocumentRepository.listAlive()` 한 건이다 —
  `AdminDtos.DocumentResponse` 를 바로 돌려주며, 중첩 record 이므로 XML 에는 바이너리명
  `com.ragchatbot.dto.AdminDtos$DocumentResponse` 로 쓴다.
- **그 대가로 SQL 이 응답 스펙에 직결된다.** 해당 엔드포인트의 응답 필드를 바꾸려면 XML 도 함께 고쳐야 한다.
  같은 모양의 타입을 하나 더 두고 서비스에서 옮겨 담는 편이 나아 보일 수 있으나, 그 변환은 필드 복사일 뿐이라
  실수할 자리만 늘린다. 직결된 만큼 **이름과 값을 따로 고정한다** — `scripts/check-response-contract.sh` 가 필드 이름을,
  `AdminDocumentFlowTest` 의 목록 한 행 단언이 값의 출처를 본다.
- **이 예외는 조회에만 적용된다.** 쓰기 경로(mapper XML 기준 `<insert>` 6 · `<update>` 10 · `<delete>` 3.
  소프트 삭제는 `<update>` 로 센다)는 `dto` 를 매핑하지 않는다. **`entity` 를 통째로 받는 것은 등록
  6건뿐이고**, **수정·삭제 13건은 전부 식별자·값 스칼라 또는 이메일 `List` 를 받는다.**

## API 설계 원칙

- **컨트롤러는 얇게.** `@Valid` 검증 → 서비스 호출 → DTO 반환이 기본이다. 사용자 식별은 `CurrentUser.id()`.
- **오류 상태 코드를 컨트롤러가 만들지 않는다.** 서비스가 도메인 예외를 던지고 `GlobalExceptionHandler` 가
  매핑한다. **서블릿 필터 단계에서 나가는 오류는 이 경로를 거치지 않는다** — 미인증 401(`SecurityConfig` 의
  `authenticationEntryPoint` 가 `sendError`, Spring 기본 오류 본문에 `message` 없음) · CORS 403(Spring
  `CorsFilter` 가 평문). 어느 쪽도 `ApiError` 가 아니다.
- **성공 상태는 컨트롤러가 정한다** — `@ResponseStatus(CREATED)`(201) 가 둘(문서 업로드 · 계정 발급), 삭제 3곳이
  `ResponseEntity.noContent()`(204), 파일 서빙이 `ResponseEntity.ok()`(200 + Content-Type).
  그 밖의 핸들러는 반환값을 그대로 돌려주고 상태를 지정하지 않는다. 채팅만 `SseEmitter`(text/event-stream) 다.
- **소유권 위반은 403 이 아니라 404 로 은닉한다.** 남의 리소스는 "없는 것"으로 보인다.
  검증은 조회 단계에서 `findByIdAndUser(...)` 형태로 막는다 — DB RLS 가 없으므로 애플리케이션 코드가 유일한 관문이다.
- **`GlobalExceptionHandler` 를 거친 오류 응답 본문은 `ApiError(code, message)` 다.** `message` 는
  **사용자에게 그대로 보일 것을 전제로** 쓴다 — 무엇을 고쳐야 하는지를 적는 것이 목표다. 다만 지키지
  못한 자리가 있다 : Vector Store 미설정 거절이 `OPENAI_VECTOR_STORE_ID` 라는 배포 변수명을 본문에
  싣는다(`AdminDocumentService`). 관리자만 닿는 경로라 두고 있으나 규칙의 예외임을 밝혀 둔다.
  화면이 실제로 그렇게 쓴다는 것은 프론트 쪽 계약이다(`frontend.md` 「API 통신」).
  위 필터 단계 오류는 이 형태가 아니다.

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
| `HttpMessageNotReadableException` | 400 | `BAD_REQUEST` |
| `MethodArgumentTypeMismatchException` | 400 | `BAD_REQUEST` |
| `NoResourceFoundException` | 404 | `NOT_FOUND` |
| `HttpRequestMethodNotSupportedException` | 405 | `METHOD_NOT_ALLOWED` |
| `HttpMediaTypeNotSupportedException` | 415 | `UNSUPPORTED_MEDIA_TYPE` |
| **그 밖의 모든 예외** | 500 | `INTERNAL_ERROR` |

마지막 줄이 **최종 폴백**이다(FEAT-OPS-002). 이것이 없던 동안에는 예상 못 한 예외만 Spring 기본
형태(`timestamp`·`status`·`error`·`path`)로 나가 이 경로에서만 응답 계약이 깨졌고, 프론트는
`message` 를 못 찾아 "요청 실패 (500)" 만 띄웠다.

- 응답에 **예외 메시지를 싣지 않는다.** SQL 조각·클래스 이름이 그대로 나가면 정보 노출이다.
  사용자에게 주는 것은 8자리 **상관 ID** 하나이고, 그 값으로 서버 로그를 찾는다.
- 스택트레이스는 `ERROR` 로 남기며 상관 ID·메서드·경로를 함께 적는다. 관측 도구를 도입하지 않고
  "오류가 났어요"를 로그의 한 줄과 이어 붙일 수 있는 유일한 수단이다.
- **SSE 스트림 도중의 오류는 여기 오지 않는다.** 응답이 이미 시작돼 상태 코드를 바꿀 수 없고,
  `ChatService` 가 `event: error` 로 따로 처리한다.
- 스프링은 더 구체적인 핸들러를 먼저 고르므로, `@ExceptionHandler(Exception.class)` 를 두어도
  전용 핸들러가 있는 예외는 그쪽으로 간다. **잠가 둔 것은 도메인 예외까지다**
  (`GlobalExceptionFallbackTest` — 예상 못 한 예외의 `ApiError` 모양 · 상관 ID · 내부 메시지 비노출 ·
  도메인 예외가 제 상태를 지킨다). **Spring 내장 MVC 예외는 두 갈래로 나눠 측정해 전부 잠갔다.**
  **본문 파싱 쪽**(#38) — 깨진 JSON · UTF-8 이 아닌 인코딩 · 빈 본문 · 경로 변수 타입 불일치가 전부
  폴백으로 떨어져 500 이었고, 지금은 전용 핸들러가 400 으로 내린다(TC-OPS-014~018).
  **라우팅 쪽**(#45) — 없는 URL · 미지원 메서드 · 미지원 미디어 타입도 실측해 보니 셋 다 500 이었고,
  지금은 각각 404 · 405 · 415 로 내린다(TC-OPS-019~021).
- **`ResponseEntityExceptionHandler` 를 상속하지 않는 것은 의도된 선택이다.** 상속하면 그쪽 기본 구현이
  Spring 6 의 `ProblemDetail`(RFC 7807 — `type`·`title`·`status`·`detail`·`instance`) 본문을 만들어
  **`{code, message}` 응답 계약이 그 경로에서만 깨진다.** 대신 요청 잘못으로 분류되는 예외를 발견할
  때마다 위 표에 `@ExceptionHandler` 를 한 줄씩 더한다. 바뀌는 표면이 그 예외 하나로 한정된다.
- **405 응답에는 `Allow` 헤더를 함께 보낸다.** RFC 9110 §15.5.6 이 MUST 로 요구한다 — 없으면 보낸 쪽은
  무엇으로 다시 쳐야 하는지 알 수 없어 상태 코드가 반쪽이 된다. 값은 `api.md` 「API 목록」에 이미
  공개된 라우트 형태라 P-3(존재 은닉)와 충돌하지 않는다.

## 인증

자체 이메일/비밀번호 + JWT stateless(HS256, `aud=auth`). 비밀번호는 BCrypt 해시로만 저장한다.

- **이메일은 소문자로 정규화**해 저장·조회하고, DB 에도 `lower(email)` 유일 인덱스를 둔다(V2).
  앱을 우회한 삽입까지 막아 "계정을 받았는데 로그인이 안 되는" 상태를 없앤다.
- **비밀번호 변경 시각(`password_changed_at`)이 토큰 무효화 기준선이다.** stateless JWT 는 서버가 회수할 수 없어,
  매 인증 요청마다 사용자 행을 읽어 `iat` 와 대조한다. 눈금은 **초** — `iat` 가 초 단위로 내림되므로 기준선도 같아야
  변경 직후 발급분이 밀리초 차이로 거부되지 않는다.
- **파일 서빙 토큰은 분리된 audience(`aud=file`)** 다. `<img src>` 가 `Authorization` 헤더를 못 실어 쿼리 토큰을 쓰는데,
  audience 를 나누지 않으면 짧은 수명의 파일 토큰이 인증 Bearer 로 통용된다. TTL 15분, `subject=fileId` 일치까지 확인한다.
- permitAll 은 로그인·헬스·파일 서빙, 그리고 SSE 비동기 재디스패치(`ASYNC`/`ERROR`)다 —
  인증은 최초 `REQUEST` 디스패치에서 이미 검사됐다.
- **만료가 임박하면 응답 헤더 `X-Refresh-Token` 으로 새 토큰을 보낸다**(FEAT-OPS-003).
  임계는 `JWT_REFRESH_THRESHOLD_MINUTES`(기본 30분)이고 **0 이면 기능이 꺼져** 종전 고정 만료로 돌아간다.
  검증을 통과한 뒤에만 발급한다 — 무효한 토큰을 갱신해 주면 만료가 무의미해진다.
  `CorsConfig` 의 **노출 헤더 등록이 빠지면 브라우저가 값을 숨겨 조용히 아무 일도 일어나지 않으므로**
  그 등록 자체를 케이스로 잠가 두었다.
- **역할(`users.role`)은 JWT 에 담지 않는다**(FEAT-ADMIN-001). 담으면 강등이 토큰 만료까지 반영되지
  않는다. 필터가 이미 요청마다 사용자 행을 읽고 있으므로 같은 조회에서 함께 읽는다 — 추가 쿼리가 없다.
- 승격·강등은 환경변수 `ADMIN_EMAILS` 명단으로만 일어난다. **앱에 권한 상승 API 가 없다.**
  기동 시 명단에 없는 관리자를 내리고 명단에 있는 사용자를 올린다 — 강등이 없으면 명단이 통제 수단이
  되지 못한다. **명단에 있는데 계정이 없으면 계정째로 만든다**(2026-09-07). 종전에는 그 자리를
  회원가입이 메웠는데, 가입을 없애면 빈 DB 에서 관리자가 영영 0명이 되고 계정 발급 API 는 관리자만
  부를 수 있어 아무도 첫 계정을 만들지 못한다. 임시 비밀번호는 **기동 로그에 한 번만** 찍는다 —
  환경변수로 받으면 값을 바꾸지 않는 한 계속 유효한 비밀번호로 남고, 마이그레이션으로 심으면 해시가
  저장소에 박혀 모든 배포가 같은 초기 비밀번호를 갖는다. **이미 계정이 있으면 손대지 않는다** —
  매 기동마다 갈아엎으면 재기동이 곧 계정 잠금이 된다.
  대안이었던 **DB 수동 UPDATE** 는 배포마다 DB 접속이 필요해 절차가 문서에만 존재하게 되므로 기각했다.
  대가는 **명단 변경에 재기동이 필요**하다는 것이다 — 사내 소규모에서 관리자 교체는 드물어 감수한다.
- **권한 없음도 404 다.** 관리 기능의 존재 자체를 드러내지 않는다(`AdminAccessGuard`).
- **계정을 스스로 만드는 경로가 없다**(2026-09-07). 계정이 태어나는 자리는 둘이고
  **둘 다 관리자 통제 아래** 있다 — 관리자가 부르는 `POST /api/admin/users` 와, `ADMIN_EMAILS` 를 보고
  첫 관리자를 만드는 기동 러너(위 항목)다. `userRepository.insert` 를 부르는 곳도 그 둘뿐이다
  (테스트는 옛 계정을 흉내내려고 `jdbc` 로 직접 넣는 곳이 있다). 임시 비밀번호를 응답에 한 번 싣고 저장하지 않는 것은 비밀번호 초기화와 같은 규칙이며,
  **같은 생성기**(`TemporaryPasswordGenerator`)를 쓴다 — 두 곳이 각자 만들면 한쪽만 규칙이 바뀌어도
  사용자가 받는 문자열의 성질이 갈리는데 아무도 눈치채지 못한다.
- **계정은 허용 도메인으로만 만든다**(`ALLOWED_EMAIL_DOMAINS`, FEAT-AUTH-001). `live` 에서 명단이
  비면 기동을 막는다 — "비면 전원 허용"으로 두면 배포에서 변수를 빠뜨렸을 때 조용히 경계가 사라진다.
  가입이 없어진 지금도 이 명단이 남는 이유는 **관리자가 주소를 손으로 치기 때문**이다. 오타 한 번이면
  사외 주소에 계정이 열린다.
  **도메인 검사는 중복 검사보다 먼저** 한다. 순서가 뒤집히면 거절할 주소에 "이미 있는 이메일"을
  돌려주게 되어 계정 존재 여부가 샌다. 서브도메인은 포함하지 않으며(정확히 일치),
  `ADMIN_EMAILS` 는 검사를 면제받는다 — 면제가 없으면 관리자 부트스트랩이 막힌다.
  **검사는 계정을 만드는 시점에만** 한다. 로그인에서도 막으면 정책 이전에 만들어진 계정이 통째로 잠긴다.

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

**검사 순서는 동시성 → 레이트리밋이다**(#96). 레이트리밋은 비용 통제가 목적인데, 동시성 상한에 걸려
되돌아간 요청은 **모델을 부르지 않아 비용이 0**이다. 순서가 반대였을 때는 스트림이 도는 중에 전송을
연타하면 전부 「이미 응답 중」 429 를 받으면서 분당 카운터만 올라, **스트림이 끝난 뒤에도 그 분이
끝날 때까지** 막혔다 — 유량 제어가 스스로를 무력화했다. 레이트리밋에서 던져도 동시성 자리는
`chat` 의 `finally` 가 반납한다. 둘 다 `prepare` 앞이라는 제약은 그대로다.

둘은 다른 것을 잰다 — 서로 다른 사용자가 한 번씩만 보내도 풀은 포화되므로 횟수 상한만으로는 막히지 않는다.
전역 상한은 `chatExecutor` 풀 크기와 **같은 프로퍼티**를 쓴다. 갈리면 초과분이 큐에 쌓여 응답 한 바이트 없이
SSE 타임아웃까지 기다리게 된다.

레이트리밋 카운터는 키 총량 상한 + LRU 축출로 메모리를 유계로 둔다. **축출은 곧 카운터 리셋**이라는 약화가 따르며,
사유는 [overview](./overview.md) 「알려진 제약」에 있다.

## DB 스키마

스키마의 소유자는 **Flyway 마이그레이션 SQL** 이다. 앱 코드가 `alter` 하지 않는다.
새 변경은 `backend/src/main/resources/db/migration/` 에 파일을 추가하고, 기존 마이그레이션은 수정하지 않는다.

마이그레이션 이력 · 테이블별 컬럼 · 인덱스는 [erd.md](../01_specs/erd.md) 가 **정본**이다.
여기에는 그 스키마를 그렇게 정한 **설계상의 이유**만 적는다.

- 모든 PK 는 `uuid`(`gen_random_uuid()`). MyBatis 는 `UuidTypeHandler` 로 매핑하고,
  snake_case 컬럼 ↔ camelCase 프로퍼티는 `map-underscore-to-camel-case` 가 처리한다.
- `messages.status` 는 `complete | error` 만 갖는다. `streaming` 은 DB 에 없는 프론트 로컬 상태다.
- `citations` 는 출처를 **영속화**한다. SSE 로만 보내면 재조회 시 각주가 사라진다.
- `attachments.message_id` 는 nullable 이다 — 업로드 시점엔 메시지가 없다. 소유는 `user_id` 기준이고,
  연결되지 않은 채 남은 첨부는 스케줄러가 회수한다.
- 재조회 질의는 **대화 단위로 한 번씩** 읽는다(`findByConversation`). 메시지마다 도는 형태는 메시지 수만큼
  질의가 나가므로 쓰지 않는다. 같은 이유로 문서 목록도 올린 사람 이름을 **조인으로 함께** 가져온다.
- 토큰 사용량 컬럼이 **nullable 인 이유**(0 을 기본값으로 두면 "모르는 것"과 "정말 0"이 합계에서 섞인다)와
  집계 질의는 [erd.md](../01_specs/erd.md) 에 있다. 여기서 알아야 할 것은 **조회할 때 반드시 걸러야 한다**는 것뿐이다.
- `rag_documents` 만 **소프트 삭제 + `on delete restrict`** 이고 나머지는 hard delete + cascade 다.
  **의도된 차이**이며 판단 근거는 [features.md](../01_specs/features.md) FEAT-ADMIN-002 「soft delete 를 쓰는 이유」에 있다.

## 파일

- 업로드 검증 순서 : MIME 허용목록 → 타입별 용량 → **매직바이트**. webp 는 RIFF 뒤 오프셋 8의 `WEBP` 마커까지 본다.
- **이미지만 받는다.** 문서(PDF)는 업로드·표시는 되는데 모델에 전달되지 않아 "그 PDF 를 근거로 답했다"는 오해를
  만들었다. 실제 근거로 쓰려면 실 키 검증이 필요하므로 지금은 **받지 않는 것**을 계약으로 한다.
- 저장 경로는 서버가 소유한다(`{userId}/{uuid}.{ext}`). 경로 탈출은 정규화 후 루트 하위인지로 막는다.
- 회수는 두 패스다 — 행 기준(`message_id is null`)과 저장소 스캔(파일은 있는데 행이 없음).
  대화 삭제 시 cascade 로 행이 먼저 사라지면 1차가 구조적으로 못 보기 때문이다.
  둘 다 최소 유예(10분)보다 최근 것은 어떤 cutoff 로도 지우지 않는다.

## RAG 문서 (관리자)

채팅 첨부와 **다른 경로**다(FEAT-ADMIN-002). 첨부는 비전 입력용이라 이미지만 받아 인라인으로 보내고,
여기는 색인용이라 문서만 받아 공용 Vector Store 에 넣는다. **두 허용 목록이 서로 반대**이므로 규칙이
새면 바로 드러나도록 케이스로 잠가 두었다.

허용 형식·용량·매직바이트 규칙과 **단계별 실패 처리표는 [features.md](../01_specs/features.md)
FEAT-ADMIN-002 가 정본**이다. 계층 쪽에서 짚을 것만 남긴다 :

- 쓰기 순서는 Files → Vector Store 연결 → DB 기록이고, **앞 단계가 실패하면 행을 만들지 않는다.**
  가장 나쁜 상태는 스토어에는 없는데 목록에만 뜨는 것이다 — 화면에 보이는데 검색에는 안 잡히고 지울 수도 없다.
- 삭제는 반대로 OpenAI 정리가 실패해도 `deleted_at` 을 채운다. 첨부 고아 회수와 같은 판단이다.
- 목록은 `in_progress` 인 행만 상태를 다시 묻는다. 완료·실패는 더 바뀌지 않는다.
- 목업 모드에서도 전 경로가 동작하며 파일 ID 에 `mock-` 접두가 붙는다.

**관리자 비밀번호 초기화**(FEAT-ADMIN-003)는 기존 무효화 기준선을 그대로 타되 경계를 **현재 초의 끝**으로
민다. 본인 변경은 "같은 초에 발급된 직전 토큰 1개"가 살아남는 틈을 감수하는데, 그 근거가 "토큰 주인이
방금 바꾼 본인"이기 때문이다. 관리자 초기화에서는 토큰 주인이 다른 사람이고 그 세션을 끊는 것이 목적이라
전제가 깨진다 — 여기서는 살려 둘 토큰이 없으므로 틈을 없앴다.

## 실행 모드

`app.mode` 는 **기본값이 없다.** 미설정이면 `AppModeGuard` 가 기동을 막는다 — 목업이 우연히 켜지는 경로를 없앴다.
`mock` 과 `live` 는 `@ConditionalOnProperty` 로 `OpenAiService` 구현 하나만 로드한다.
`prod` 프로필 + `mock` 조합도 거부한다.

설정값은 `backend/src/main/resources/application.yml` 에 `${ENV:기본값}` 으로 두고, 위험한 값
(`app.mode` · `app.jwt.secret`)은 **일부러 기본값을 비워** 기동에 실패하게 한다.

## 배포

두 갈래가 있다. **상시 공개**는 자체 호스팅 서버에 컨테이너를 올리고, **데모**는 로컬 인스턴스를 터널로 노출한다.
환경변수 요구사항은 어느 쪽이든 같다.

필요한 환경변수와 각 값의 의미는 `backend/.env.example` 에 있다. 배포 시 반드시 확인할 것 :

| 항목 | 빠뜨리면 |
|------|----------|
| `APP_MODE` | **기동 실패**(의도된 동작). `mock` 이면 키 없이 전 경로가 돈다 |
| `JWT_SECRET` | 기동 실패 |
| `DB_URL` · `DB_USERNAME` · `DB_PASSWORD` | 기동 실패. URL 은 `jdbc:postgresql://…` 형식이어야 함 — 관리형 DB 가 주는 `postgres://…` 를 그대로 넣으면 뜨지 않음 |
| `ALLOWED_ORIGINS` | 기동은 되고 **`http://localhost:5173` 만 허용**된다(기본값). 배포 도메인은 안 들어가므로 브라우저가 CORS 로 막는다 |
| `OPENAI_API_KEY` | `live` 에서만 필요. `live` 인데 비면 기동 실패(fail-fast) |
| `OPENAI_VECTOR_STORE_ID` | 기동·응답은 되지만 file_search 없이 답해 **출처가 늘 0건**(전부 "자료 없음") |

스키마는 기동 시 Flyway 가 적용하므로 별도 마이그레이션 단계가 필요 없다.
헬스체크 경로는 `GET /api/health`(인증 불필요)다.

### 상시 공개 - 자체 호스팅 서버

우분투 서버 한 대에 `docker-compose.yml` 로 **앱 · Postgres · cloudflared** 세 컨테이너를 띄운다.

**왜 이 조합인가** — 요구가 넷이었고 이를 동시에 만족하는 무료 PaaS 가 없었다 :
첨부용 영속 볼륨 · SSE 상시 연결(콜드스타트 불가) · Postgres · 단일 인스턴스.

| 대안 | 탈락 이유 (2026-08-20 조사) |
|------|------|
| Render 무료 | 영속 디스크 불가(첨부 소실) · 15분 무활동 시 스핀다운 · 무료 Postgres 30일 만료 |
| Fly.io | 2024-10 이후 신규 계정 무료 티어 폐지 |
| Koyeb | 2026-02 Mistral AI 인수 후 무료 티어 신규 가입 차단 |
| Railway | 상시 무료 없음. 이 구성 기준 월 $17~20 |
| Cloud Run | 무료 한도가 미국 리전 한정 · JVM 콜드스타트 · 영속 볼륨 없음 |

**Oracle Cloud Always Free 는 시도했다가 접었다.** 스펙(2 OCPU/12GB ARM · 블록 스토리지 200GB)이
요구를 전부 만족해 1순위였고 계정 · VCN · 서브넷까지 만들었으나, **오사카 리전에서 A1 인스턴스가
용량 부족으로 생성되지 않았다** — `Out of capacity for shape VM.Standard.A1.Flex`. 오사카는 가용성
도메인이 하나뿐이라 "다른 AD 로" 라는 회피가 성립하지 않고, 홈 리전은 가입 후 변경할 수 없다.
재시도 자동화까지 갔지만 확보하지 못했다 — **무료 A1 확보는 재고 운의 문제라 일정에 넣을 수 없다**는
것이 결론이다.

**전환 조건** : 월 $10~15 를 쓸 수 있게 되면 Fly.io 로 옮긴다 — 볼륨 · Postgres · TLS 가 플랫폼에
딸려 오고 도쿄 리전이 있어 이 구성에서 가장 싸다. 첨부를 S3 호환(R2 등)으로 빼면 무료 PaaS
선택지도 되살아난다.

**인바운드 포트를 열지 않는다.** cloudflared 가 바깥으로 연결을 걸어 터널을 유지하므로 공인 IP ·
포트포워딩 · 방화벽 인그레스 규칙이 전부 필요 없다 — 사무실·캠퍼스 망처럼 **라우터 권한이 없는
환경에서도 성립하는 이유**가 이것이다. TLS 는 Cloudflare 가 종단하므로 인증서 관리도 없다.

절차 :

1. 서버에 Docker 와 compose 플러그인을 설치한다
2. `backend/.env` 를 만든다(정본 `backend/.env.example`). **`DB_URL` · `DB_USERNAME` · `DB_PASSWORD` 는
   넣어도 무시된다** — compose 가 덮어쓴다
3. 루트 `.env` 를 만든다(정본 `.env.example`) — `POSTGRES_PASSWORD` · `TUNNEL_TOKEN`
4. Cloudflare 대시보드에서 터널을 만들고 공개 호스트명을 **`http://app:8080`** 에 매핑한다.
   `localhost` 가 아니다 - cloudflared 는 별도 컨테이너라 compose 네트워크 이름으로 찾아간다
5. `docker compose up -d --build`
6. 백엔드 `ALLOWED_ORIGINS` 에 **Vercel 도메인**을, 프론트 `VITE_API_BASE_URL` 에 **터널 도메인**을 넣는다

**이미지 빌드는 `mvnw` 를 쓰지 않는다.** build 스테이지가 `maven:3.9.16-eclipse-temurin-17-alpine` 이라
Maven 이 이미지 안에 있다. wrapper 를 쓰면 빌드마다 배포판 zip 을 Maven Central 에서 내려받는데,
의존성 해석보다 앞선 단계라 레이어 캐시로도 덮이지 않고 Central 이 거절하면 이미지 빌드가 통째로 멎는다.
버전은 wrapper 가 쓰던 3.9.16 과 같게 고정했고, `mvnw` 자체는 로컬·CI 용으로 그대로 남는다.
**의존성 해석은 여전히 Central 을 타므로** 그쪽은 재시도 두 번으로 덮는다 — 없앤 것은 배포판이라는 한 홉이다.
멀티스테이지라 최종 이미지는 `eclipse-temurin:17-jre-alpine` 그대로이며, 실측 크기 차이는 45바이트였다.

**첨부 파일은 로컬 디스크에 저장한다.** compose 의 `uploads` 볼륨이 `/data/uploads` 를 받으며,
이 볼륨을 떼면 업로드된 이미지가 사라진다. 볼륨을 쓸 수 없는 환경이면 `FileStorage` 구현을
S3 등으로 교체해야 한다.

**DB 백업은 자동이 아니다.** `pg_dump` 를 정기 실행하지 않으면 서버 디스크가 죽을 때 대화가 함께 사라진다.

### 데모 - 로컬 + 터널

프론트는 Vercel(https)에 있고 백엔드는 로컬이므로 `http://공인IP:8080` 직결은 성립하지 않는다 —
https 페이지가 http 를 부르면 브라우저가 mixed content 로 막는다. 터널이 https 종단을 대신 맡는다.

1. 백엔드를 평소대로 띄운다(`./mvnw spring-boot:run`, `:8080`).
   **이 경로는 `backend/.env` 를 읽지 않는다** — dotenv 로더가 없어 환경변수를 셸에 직접 넣어야 한다.
   `.env` 를 그대로 쓰려면 `docker compose up -d --build db app` 으로 띄운다
2. 터널을 연다 — `ngrok http 8080` 또는 `cloudflared tunnel --url http://localhost:8080`
3. 백엔드 `ALLOWED_ORIGINS` 에 **Vercel 도메인**을 넣는다. 터널 주소가 아니다 —
   이 값은 백엔드의 공개 주소가 아니라 **요청을 보내는 화면의 출처**다
4. Vercel `VITE_API_BASE_URL` 에 **터널 주소**를 넣고 재배포한다

터널 프로세스와 백엔드 프로세스는 수명이 다르다. 백엔드만 재시작하면 주소가 유지되므로 재배포가
필요 없고, 주소가 바뀌는 것은 **터널을 재시작할 때**다. 여기서 도구가 갈린다 :

| 도구 | 주소 | 대가 |
|------|------|------|
| ngrok 무료 | 계정당 고정 도메인 1개 — 재시작해도 같음 | 월 20,000 요청 · 1GB. 브라우저 요청에 경고 페이지(interstitial)를 끼움 |
| cloudflared quick tunnel | 켤 때마다 랜덤 | 주소가 바뀔 때마다 Vercel 재배포 |

ngrok 의 경고 페이지는 요청에 `ngrok-skip-browser-warning` 헤더를 실으면 건너뛴다. 다만 이 앱에서는
그 우회가 절반만 가능하다 — `CorsConfig` 의 허용 헤더가 `Authorization` · `Content-Type` 화이트리스트라
헤더를 실으려면 거기에도 추가해야 하고, 첨부 이미지는 `<img src>` 로 나가서(`MessageList`) 헤더를 실을 수 없다.
ngrok 문서는 interstitial 이 HTML 브라우저 요청에만 붙고 이미지·API 요청에는 해당하지 않는다고 밝히지만
**이 저장소에서 실측한 적은 없다.** 데모 전에 로그인과 첨부 이미지 표시부터 확인하고, 깨지면 그때 고친다.

첨부는 로컬 디스크(`FILE_STORAGE_ROOT`, 기본 `./uploads`)에 그대로 쌓이므로 이 경로에는 볼륨 문제가 없다.
대신 **PC 가 꺼지면 데모도 끝난다.**

## 테스트

통합 테스트는 Testcontainers 로 **실 PostgreSQL** 을 띄운다(`AbstractPgIntegrationTest`). H2 로 대체하지 않는다 —
`gen_random_uuid()` · `timestamptz` · 트리거 · `lower(email)` 표현식 유일 인덱스가 실물과 갈린다.
케이스 수 하한은 `scripts/case-floors.env` 의 `BACKEND_MIN` 이 잠근다 - **실측값이 정본이라 여기 숫자를 적지 않는다.** 로컬 실행에 Docker 가 필요하다.

통합 테스트는 **고아 회수 크론을 꺼 둔다**(`app.file.orphan-cleanup-cron=-`). `@EnableScheduling` 이 켜져 있어
그냥 두면 테스트 도중 매시 정각에 실제로 발화하는데, 회수 대상이 DB 행과 공유 저장소 디렉터리라 결과가
실행 시각에 따라 갈린다. 스케줄러 자체는 `OrphanCleanupSchedulerTest` 가 결정적으로 검증한다.
