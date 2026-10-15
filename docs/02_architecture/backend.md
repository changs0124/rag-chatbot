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
- **이 예외는 조회에만 적용된다.** 쓰기 경로(mapper XML 기준 `<insert>` 7 · `<update>` 9 · `<delete>` 3.
  소프트 삭제는 `<update>` 로 센다)는 `dto` 를 매핑하지 않는다. **`entity` 를 통째로 받는 것은 등록
  7건뿐이고**, **수정·삭제 12건은 전부 식별자·값 스칼라 또는 이메일 `List` 를 받는다.**

## API 설계 원칙

- **컨트롤러는 얇게.** `@Valid` 검증 → 서비스 호출 → DTO 반환이 기본이다. 사용자 식별은 `CurrentUser.id()`.
- **오류 상태 코드를 컨트롤러가 만들지 않는다.** 서비스가 도메인 예외를 던지고 `GlobalExceptionHandler` 가
  매핑한다. **서블릿 필터 단계에서 나가는 오류는 이 경로를 거치지 않는다** — 미인증 401(`SecurityConfig` 의
  `authenticationEntryPoint` 가 `sendError`, Spring 기본 오류 본문에 `message` 없음) · CORS 403(Spring
  `CorsFilter` 가 평문). 어느 쪽도 `ApiError` 가 아니다.
- **성공 상태는 컨트롤러가 정한다** — `@ResponseStatus(CREATED)`(201) 가 둘(문서 업로드 · 계정 발급), 삭제 3곳이
  `ResponseEntity.noContent()`(204), 파일 · 문서 그림 서빙이 `ResponseEntity.ok()`(200 + Content-Type).
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
| `MissingServletRequestPartException` · `MultipartException` | 400 | `BAD_REQUEST` |
| **그 밖의 모든 예외** | 500 | `INTERNAL_ERROR` |

마지막 줄이 **최종 폴백**이다(FEAT-OPS-002). 없으면 예상 못 한 예외가 Spring 기본 형태로 나가 응답 계약이 깨진다.

- 응답에 **예외 메시지를 싣지 않는다.** SQL 조각·클래스 이름이 그대로 나가면 정보 노출이다.
  사용자에게 주는 것은 8자리 **상관 ID** 하나이고, 그 값으로 서버 로그를 찾는다.
- 스택트레이스는 `ERROR` 로 남기며 상관 ID·메서드·경로를 함께 적는다. 관측 도구를 도입하지 않고
  "오류가 났어요"를 로그의 한 줄과 이어 붙일 수 있는 유일한 수단이다.
- **SSE 스트림 도중의 오류는 여기 오지 않는다.** 응답이 이미 시작돼 상태 코드를 바꿀 수 없고,
  `ChatService` 가 `event: error` 로 따로 처리한다.
- 스프링은 더 구체적인 핸들러를 먼저 고르므로, `@ExceptionHandler(Exception.class)` 를 두어도
  전용 핸들러가 있는 예외는 그쪽으로 간다. 폴백과 도메인 예외는 `GlobalExceptionFallbackTest` 가 잠근다
  (`ApiError` 모양 · 상관 ID · 내부 메시지 비노출 · 도메인 예외가 제 상태를 지킨다).
  **Spring 내장 MVC 예외(본문 파싱 · 라우팅 · 업로드)는 전용 핸들러로 4xx 를 낸다** — TC-OPS-014~023 이 잠근다.
  용량 초과 413 은 더 구체적인 핸들러가 그대로 받는다.
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
  **이 토큰은 비밀번호 변경 기준선(`password_changed_at`)을 타지 않는다**(#104) — 서명 · 만료 · `fileId` 만 본다.
  즉 REQ-AUTH-003 의 「전부 끊긴다」는 **인증 토큰(`aud=auth`)에 대한 것**이고, 그 시점에 이미 발급된
  첨부 URL 은 **최대 15분** 더 열려 있다. 대화를 한 번 조회하면 그 대화의 첨부 URL 이 전부 응답에
  실리므로(`ConversationService` 가 조회 시점에 새로 서명한다), 탈취된 세션이 그것을 긁어 두면
  비밀번호를 초기화해도 그 창만큼은 닫히지 않는다. **새 URL 은 만들 수 없어 창은 스스로 닫힌다.**

  **기준선을 태우지 않은 이유는 비용이다.** 태우면 이미지 요청마다 사용자 행을 읽어야 하고(지금은
  서명 검증만으로 끝난다), 비밀번호를 **스스로 바꾼** 사용자도 열려 있던 화면의 이미지가 전부 깨진다 —
  `MyPage` 는 새 토큰으로 갈아 끼우지만 **이미 렌더된 `<img>` 의 URL 은 갱신되지 않는다.**
  TTL 이 15분이라 창이 짧고, 정상 사용자에게 눈에 보이는 회귀를 만들지 않는 쪽을 택했다.
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
  되지 못한다. 규칙은 셋이다.
  1. **명단에 있는데 계정이 없으면 계정째로 만든다** — 가입 경로가 없고 계정 발급 API 는 관리자만 부를 수 있어,
     없으면 빈 DB 에서 아무도 첫 계정을 만들지 못한다.
  2. 임시 비밀번호는 **기동 로그에 한 번만** 찍는다 — 환경변수로 받으면 계속 유효한 비밀번호로 남고,
     마이그레이션으로 심으면 모든 배포가 같은 초기 비밀번호를 갖는다. 로그는 10MB×3 으로 회전시킨다
     (Docker 기본 json-file 은 회전이 없어 그 값이 평문으로 남는다).
  3. **이미 계정이 있으면 손대지 않는다** — 매 기동마다 갈아엎으면 재기동이 곧 계정 잠금이 된다.

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

이벤트 순서(`meta → stage* → token* → citations → done`/`error`) · 종료 경로 · 중단 · 타임아웃 저장의 계약은
[api.md](../01_specs/api.md) API-POST-005 가 정본이다. 여기에는 `ChatController` → `ChatService` 쪽 구현 이유를 적는다.

- **검증은 동기, 스트리밍은 비동기.** 레이트리밋(429) · 동시성 상한(429) · 검증(400/404)은 SSE 안의 이벤트가 아니라
  **정상 HTTP 응답**으로 나간다. 스트림이 열린 뒤에는 상태 코드를 바꿀 수 없기 때문이다.
- **동시성 상한은 `prepare` 앞에서 잡는다.** `prepare` 가 사용자 메시지를 저장하므로, 뒤에서 거절하면 답변 없는
  메시지가 대화에 남는다.
- **스트림 수명은 SSE emitter 타임아웃이 단독으로 정한다**(기본 10분). MVC async 타임아웃은 꺼 둔다.
  emitter 가 닫힌 뒤의 `send` 는 `IllegalStateException` 이라 `done` 도 `error` 도 실을 수 없다 —
  api.md 의 **세 번째 종료 경로**(종료 이벤트 없이 끊김)가 여기서 생긴다.
- **타임아웃은 `timed_out` 으로 저장에 남긴다**(#84). 남기지 않으면 같은 타임아웃이 마지막 토큰의
  타이밍에 따라 「사용자 중단」·「정상 완료」·「진짜 오류」 셋 중 하나를 사칭한다. 여섯 갈래의 조합표는
  `docs/01_specs/erd.md` 「messages」에 있다. **자원 반납은 이 플래그로 해결되지 않는다** — 워커의
  블로킹 read 는 인터럽트로 깨지지 않아 읽기 타임아웃이 따로 필요하며, 그쪽은
  `app.openai.stream-read-timeout-ms` 가 맡는다(아래 「유량 제어」).
- **중단(사용자 정지·연결 끊김)은 실패가 아니다.** 받은 데까지 `status=complete` + `stopped=true` 로 저장한다.
  **서버 타임아웃도 도중에 떨어지면 같은 모양이 되므로** `timed_out` 을 함께 본다 — 사용자가 누른 적
  없는 정지가 기록에 남는 것을 막는다.
  인용은 스트림 끝에 오므로 중단 시점에는 늘 0건이며, `stopped` 가 없으면 무자료 배너가 거짓으로 붙는다.
- **저장 텍스트는 화면에 닿은 것과 같다.** 토큰을 보낸 **뒤에** 버퍼에 담아, 전송 실패한 토큰은 남기지 않는다.
- **진행 단계 라벨 문자열은 LLM 구현이 소유한다.** `ChatService` 는 실행 모드를 알지 못한다. 목업은 목업임이
  드러나는 전용 문구를 쓴다.
- **조회 단계 라벨은 실제로 참조한 자료명을 밝힌다.** 그 이름은 화면 하단 출처 목록과 **같은 값**
  (`CitationData.sourceName`)에서 파생한다 — 따로 문자열을 두면 진행 문구가 말한 자료와 실제로 붙는 출처가
  언젠가 어긋나고, 그 어긋남 자체가 거짓 표시가 된다. 참조한 자료가 없거나(무자료) 그 시점에 아직 알 수 없으면
  (라이브의 `file_search` 시작 시점) 이름을 붙이지 않는다. 없는 이름을 지어내지 않는다.
- **출처 파일은 annotation 이 정한다.** `file_citation` annotation 이 0건이면, 본문 인용 표기(`turnNfileM`)로
  복원한다(#281). 대응 규칙은 `live-integration.md` 3-1 에 있다.
- **스니펫은 그 파일의 검색 결과 중 답이 쓴 청크다**(`OpenAiRealService.pickSnippet`, #268). annotation 에는
  어느 청크인지가 없어서, 예전처럼 검색 1순위를 쓰면 답과 무관한 단락이 출처로 보였다. 고르는 순서는 셋이다.
  1. 답의 그림 표식 `[[그림:<key>]]` 를 담은 청크
  2. 답과 겹치는 글자 2-gram(공백 제외) 종류가 가장 많은 청크. 동점이면 앞 순위
  3. 겹침이 0 이면 1순위

  화면에는 200자만 보이고, 청크(800토큰)의 앞부분은 옆 절일 수 있다. 그래서 고른 청크 안에서도 시작 위치를 고른다.
  그림 표식이 있으면 그 자리에서, 없으면 답과 가장 많이 겹치는 줄에서 시작한다.

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
  내용이라 포함한다. 단 `timed_out && stopped`(타임아웃이 토큰 도중에 떨어진 것)는 제외한다(#84) —
  `docs/01_specs/erd.md` 「messages」 조합표의 세 번째 줄이다.
- 이력은 **새 사용자 메시지를 저장하기 전에** 읽는다. 저장 후 읽으면 방금 보낸 메시지가 이력에 섞여
  같은 말이 두 번 전달된다.

토큰 수는 문자 수 기반 근사(한국어 기준 1.5자당 1토큰)다. 정확한 토크나이저를 붙이지 않는 이유는 이 값이
하드 한도가 아니라 **예산 가드**이기 때문이며, 영어에서 과대평가되는 방향은 이력이 짧아지는 쪽이라 안전하다.
- 스트리밍 구간에서는 DB 커넥션을 잡지 않는다. 저장은 `ChatPersistenceService` 가 메시지·출처·touch 를
  **한 트랜잭션**으로 처리한다.

## 유량 제어

| 장치 | 재는 것 | 기본값 |
|------|---------|--------|
| `RateLimiterService` | 사용자별 **분당 횟수**(채팅 · 업로드 · 비밀번호 변경) · 계정별 분당 로그인 시도 | 20 / 30 / 5 / 10 |
| `ChatConcurrencyLimiter` | **지금 열려 있는 스트림 수**(전역 · 사용자별) | 16 / 1 |

**전역 상한은 16 이다(#278, 종전 8).** 8 이면 서로 다른 사용자 9명째부터 즉시 429 였다. 스트림 하나는 대부분의 시간을
모델 응답을 기다리며 보내 CPU · 메모리를 거의 쓰지 않으므로 풀을 늘려도 부담이 작다.
Hikari 풀 5(compose)는 그대로 둔다 — 커넥션은 스트림 앞뒤의 짧은 저장에만 잡혀 16명에서도 커넥션 대기 오류가 없었다.

운영 실측(2026-10-15 15:15 KST, Lightsail 2 vCPU · 4GB · app 1GiB · Hikari 5, 공개 API 경유, 상한 16) :

| 동시 사용자 | 200 / 429 | 완료 p50 / p95 | app 메모리 최고 |
|---|---|---|---|
| 8 | 8 / 0 | 7.2 / 8.4초 | 207MiB |
| 12 | 12 / 0 | 6.5 / 8.7초 | 212MiB |
| 16 | 16 / 0 | 5.6 / 9.7초 | 223MiB |
| 17 | 16 / 1 | 6.6 / 7.9초 | 224MiB |

섞임 · 저장 불일치 · 스트림 오류 · OpenAI 쪽 거절 · 커넥션 대기 모두 0. 측정 전 메모리는 178MiB 였다 — 동시 16에서도
늘어난 몫은 50MiB 남짓이라, 한도를 정하는 것은 메모리가 아니라 모델 호출 비용과 OpenAI 계정 한도다.
되돌리려면 서버 `.env` 에 `CHAT_MAX_CONCURRENT_STREAMS=8` 을 넣고 app 만 재시작한다.

**검사 순서는 동시성 → 레이트리밋이다**(#96). 레이트리밋은 비용 통제가 목적인데, 동시성 상한에 걸려
되돌아간 요청은 **모델을 부르지 않아 비용이 0**이다. 순서가 반대였을 때는 스트림이 도는 중에 전송을
연타하면 전부 「이미 응답 중」 429 를 받으면서 분당 카운터만 올라, **스트림이 끝난 뒤에도 그 분이
끝날 때까지** 막혔다 — 유량 제어가 스스로를 무력화했다. 레이트리밋에서 던져도 동시성 자리는
`chat` 의 `finally` 가 반납한다. 둘 다 `prepare` 앞이라는 제약은 그대로다.

둘은 다른 것을 잰다 — 서로 다른 사용자가 한 번씩만 보내도 풀은 포화되므로 횟수 상한만으로는 막히지 않는다.
전역 상한은 `chatExecutor` 풀 크기와 **같은 프로퍼티**를 쓴다. 갈리면 초과분이 큐에 쌓여 응답 한 바이트 없이
SSE 타임아웃까지 기다리게 된다. 그 결합을 지키는 것이 「같은 프로퍼티 문자열」뿐이었으므로
`ChatExecutorPoolBindingTest` 가 풀 크기와 상한이 같은 수인지를 잠근다.

**업스트림 읽기 타임아웃은 SSE 타임아웃보다 짧아야 하며, 아니면 기동에 실패한다**(#76·#92).
워커의 블로킹 read 는 인터럽트로 깨지지 않아, emitter 가 죽어도 읽기가 끝나야 스레드와 동시 스트림
권한이 풀린다 — 그 사이 사용자는 **화면에 아무 스트림도 없는데 429** 를 받는다. 종전에는 두 값이
정확히 같아(둘 다 10분) 결말이 밀리초 경합이었다. 그리고 **클라이언트를 스트리밍용/일반용으로
나눴다** — 하나뿐이던 시절에는 그 10분이 문서 상태 조회·업로드·삭제에도 걸려, `in_progress` 3건이면
관리자 목록 요청 하나가 최대 30분 톰캣 스레드를 잡았다.

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

## 문서 그림

답변에 문서 그림을 보여주는 경로다(FEAT-CHAT-004). **업로드 경로가 없다** — 그림은 오프라인 전처리
(`scripts/doc-figures/preprocess.py`)가 만들고, 배포자가 서버 디렉터리에 복사한다.

- 루트는 `app.doc-figures.dir`(env `DOC_FIGURES_DIR`). 비어 있으면 **live 는 모든 키가 404**, mock 은 classpath
  `mock-figures/` 의 견본을 쓴다. 기동은 막지 않는다 — 그림은 보조 정보라 빠져도 답변은 성립한다.
- 키는 `^[a-z0-9-]{1,64}$` 만 받고 `<루트>/<key>.png` 로만 찾는다. 경로 조각을 그대로 붙이지 않으므로
  `..` 같은 탈출은 정규식 단계에서 끝난다. 형식 오류도 404 다.
- **DB 행이 없다.** 파일이 있으면 그림이 있는 것이다. 매니페스트(`manifest.json`)는 사람이 대조하려고 두는 것이고
  서버는 읽지 않는다 — 읽으면 파일과 매니페스트가 어긋나는 상태가 하나 더 생긴다.
- compose 는 저장소 루트의 `doc-figures/` 를 컨테이너 `/data/doc-figures` 에 **읽기 전용**으로 붙인다.
  저장소가 공개라 이 폴더는 `.gitignore` 로 막는다.

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
`mock` 과 `live` 는 `@ConditionalOnExpression` 으로 `OpenAiService` 구현 하나만 로드한다. **모드를 읽는 규칙은
`AppModeGuard.normalize`(앞뒤 공백 제거 · 소문자) 하나다(#248)** — 가드 · 구현 선택 · `EmailDomainPolicy` 의 live 검사 ·
`DocFigureService` 의 견본 그림이 모두 이것을 거친다. 종전에는 가드만 정규화해 `APP_MODE=LIVE` 에서 허용 도메인 검사가 빠졌다.
`prod` 프로필 + `mock` 조합도 거부한다. 그 프로필은 `docker-compose.yml` 이 app 에 기본으로 켠다(#305) —
종전에는 켜는 곳이 없어 이 검사가 운영에서 걸리지 않았다. 로컬 compose 로 목업을 띄울 때만 `SPRING_PROFILES_ACTIVE=` 로 비운다.

설정값은 `backend/src/main/resources/application.yml` 에 `${ENV:기본값}` 으로 두고, 위험한 값
(`app.mode` · `app.jwt.secret`)은 **일부러 기본값을 비워** 기동에 실패하게 한다.

**외부 호출과 DB 를 함께 건드리는 흐름은 「던질 수 있는 쪽」을 앞에 둔다**(#72 · #98).
실패하면 아무것도 바뀌지 않아야 하기 때문이다. 업로드에서 던질 수 있는 것은 OpenAI 단계라 그쪽이
앞이고(그 뒤 DB 기록이 실패하면 OpenAI 쪽을 되돌린다), 삭제에서 던질 수 있는 것은 DB 뿐이라
`softDelete` 가 앞이다 — `deleteDocument` 는 `deleteQuietly` 기반이라 **절대 던지지 않는다.**
두 경로의 순서가 달라 보이는 이유가 이것이다.

**던지지 않는 대신 순서로 막는다(#271).** `deleteDocument` 는 스토어 연결 해제가 성공(또는 이미 없음 404)했을 때만
File 을 지운다. 해제가 실패한 채 File 만 지우면 스토어에 이름 없는 연결이 남아 **검색에는 계속 잡히는데 다시 지울
손잡이가 없다** — 실제로 그랬다. 해제 요청이 JDK 기본 Content-Type(form)으로 나가 400 으로 거절됐고 `deleteQuietly` 가
그것을 삼켰다. 지금은 DELETE 에 `Content-Type: application/json` 을 명시한다. File 이 남아 있으면 「스토어와 동기화」가
행을 되살려 관리자가 다시 지울 수 있다. 이미 생긴 고아 연결(File 404)은 동기화가 `missing` 으로 받아 연결을 끊는다 —
종전에는 그 404 하나로 동기화 전체가 500 이었다.

`app.jwt.secret` 은 비어 있는지만이 아니라 **길이도 본다** — 32바이트 미만이면 `JwtSecretPolicy` 가
기동을 막는다. 하한을 한 곳에 둔 이유는 이 키를 `JwtService`(aud=auth)와
`FileAccessTokenService`(aud=file) 둘이 공유하기 때문이다. 각자 들고 있으면 한쪽만 올렸을 때
조용히 갈리는데, **두 토큰이 같은 키로 서명되므로 약한 쪽이 곧 전체의 실효 강도**다.
`/api/files/**` 는 permitAll 이라 파일 토큰의 서명이 그 경로의 유일한 경계라는 점이 특히 그렇다.

## 배포

두 갈래가 있다. **상시 공개**는 자체 호스팅 서버에 컨테이너를 올리고, **데모**는 로컬 인스턴스를 터널로 노출한다.
환경변수 요구사항은 어느 쪽이든 같다.

**지금 무엇이 남았는지는 이 문서에 적지 않는다(#177).** 여기는 **절차**의 정본이고,
남은 일은 [current-sprint](../04_tasks/current-sprint.md) 가 정본이다. 2026-10-06 런칭으로
상시 공개 쪽이 운영 중이며, 그 경위는 [CHANGELOG](../06_changelog/CHANGELOG.md) 에 있다(#213).

필요한 환경변수와 각 값의 의미 · 빠뜨렸을 때의 증상은 `backend/.env.example`(compose 배선은 루트 `.env.example`)이 정본이다.
기동을 막는 것과 나중에야 드러나는 것의 구분은 [live-integration](../01_specs/live-integration.md) 1절에 있다.

스키마는 기동 시 Flyway 가 적용하므로 별도 마이그레이션 단계가 필요 없다.
헬스체크 경로는 `GET /api/health`(인증 불필요)다.

### 상시 공개 - 자체 호스팅 서버

우분투 서버 한 대에 `docker-compose.yml` 로 **앱 · Postgres · cloudflared** 세 컨테이너를 띄운다.

**왜 이 조합인가** — 요구 넷(첨부용 영속 볼륨 · SSE 상시 연결(콜드스타트 불가) · Postgres · 단일 인스턴스)을
동시에 만족하는 무료 PaaS 가 없어 자체 호스팅 단일 서버로 간다. 대안별 탈락 사유와 호스트 이전 경위는 [CHANGELOG](../06_changelog/CHANGELOG.md) #243 에 있다.
**다시 볼 조건** : DB · 볼륨 백업을 관리형으로 맡기고 싶어지면 Fly.io 같은 PaaS, 첨부를 S3 호환(R2 등)으로 빼면 무료 PaaS 도
선택지가 된다. 컨테이너 구성이라 이전 비용은 거의 없다.

운영 구성 :

| 항목 | 값 |
|------|-----|
| 서비스 | AWS Lightsail · 서울(`ap-northeast-2`) · Ubuntu 24.04 |
| 플랜 | **월 $24** — 2 vCPU(기준 성능 20%) · 4GB RAM · 80GB SSD · 전송 4TB |
| 네트워크 | 고정 IP 부여 · 방화벽은 **SSH 22 만**(아래 「인바운드」) |
| 터널 | Cloudflare Tunnel **그대로** — 터널 · 공개 호스트명 · 토큰을 바꾸지 않는다 |
| 백업 | Lightsail 자동 일일 스냅샷(아래 「백업」) |

**CPU 가 20% 기준 성능**이라 지속 부하에는 크레딧을 쓴다 — 채팅 서비스는 대부분 유휴라 감수한다.
메모리 상한은 아래 「메모리 상한」.

**서비스 트래픽에는 인바운드 포트를 열지 않는다.** cloudflared 가 바깥으로 연결을 걸어 터널을
유지하므로 공개 호스트명에 대한 포트포워딩·인그레스 규칙이 필요 없다 — 사무실·캠퍼스 망처럼
**라우터 권한이 없는 환경에서도 성립하는 이유**가 이것이다. TLS 는 Cloudflare 가 종단하므로
인증서 관리도 없다. `app` 은 `127.0.0.1:8080` 루프백에만 묶이고 `db` 는 호스트에 포트를 열지 않는다.

**다만 「인바운드가 하나도 없다」는 아니다(#129).** 배포·운영이 ssh/scp 를 쓰므로 **TCP 22 가 열려 있어야 한다.**
Lightsail 은 인스턴스 방화벽에서 **22 만 남기고** 나머지(기본으로 열리는 80 포함)를 닫는다. 서비스 트래픽은 터널로
들어오므로 80 · 443 이 필요 없다. 소스 IP 를 좁힐 수 있으면 좁힌다.

**터널 방식의 이점은 「서비스 포트를 안 연다」는 것이지 「서버가 인터넷에서 안 보인다」가 아니다** —
이 구분을 흐리면 방화벽을 점검할 이유가 사라진다.

절차 :

1. 서버를 준비한다(Lightsail 처음 한 번 — 아래 「Lightsail 처음 준비」). Docker 와 compose 플러그인을 설치한다
2. `backend/.env` 를 만든다(정본 `backend/.env.example`). **`DB_URL` · `DB_USERNAME` · `DB_PASSWORD` 는
   넣어도 무시된다** — compose 가 덮어쓴다
3. 루트 `.env` 를 만든다(정본 `.env.example`) — `POSTGRES_PASSWORD`. **터널 토큰은 `.env` 가 아니라
   `secrets/tunnel_token` 파일**에 넣는다(#203, 디렉터리 700 · 파일 644 — 이유는 아래 「터널 토큰은 파일로 넘긴다」)
4. Cloudflare 대시보드에서 터널을 만들고 공개 호스트명을 **`http://app:8080`** 에 매핑한다.
   `localhost` 가 아니다 - cloudflared 는 별도 컨테이너라 compose 네트워크 이름으로 찾아간다
5. 개발 PC 에서 `bash scripts/deploy.sh` — 빌드 · 전송 · 기동 · 헬스체크까지 한 번에 한다.
   접속은 일반 `ssh` · `scp` 다(#243 — `gcloud` 를 걷어냈다). 대상은 환경변수로 지정한다.
   **`DEPLOY_HOST` 는 기본값이 없어 반드시 넣어야 한다(#133)** — 저장소가 공개라 기본값을 두는 것은
   배포 대상이 어디인지 적어 두는 것과 같다. 비면 `--dry-run` 을 포함해 **아무것도 하기 전에** 무엇이 빠졌는지
   알리고 멈춘다. 사전 도구는 `docker` · `ssh` · `scp` · `gzip` 이다 :

   | 변수 | 필수 | 뜻 |
   |------|------|-----|
   | `DEPLOY_HOST` | 예 | `~/.ssh/config` 의 **Host 별칭** |
   | `DEPLOY_DIR` | 아니오 (기본 `deploy`) | 서버의 compose 디렉터리. **원격 홈 기준 상대 경로다**(#129) |

   IP · 사용자 · 키 경로는 별칭 쪽에만 둔다 — 저장소에도 명령줄에도 남기지 않는다. 개발 PC 의 `~/.ssh/config` :

   ```
   Host <별칭>
       HostName <고정 IP>
       User ubuntu
       IdentityFile <키 경로>
   ```

   플래그는 둘이다 — `--dry-run`(무엇을 할지만 출력) · `--skip-build`(이미 빌드된 이미지로 전송만).
   **`.env` 두 개는 보내지 않는다** — 비밀이 로컬에 있을 이유가 없고, 서버에 이미 있다.
   compose 파일은 함께 보낸다. 서버의 것이 저장소보다 뒤처져 조용히 다른 설정으로 도는 사고를 막는다.
6. 백엔드 `ALLOWED_ORIGINS` 에 **Vercel 도메인**을, 프론트 `VITE_API_BASE_URL` 에 **터널 도메인**을 넣는다

**Lightsail 처음 준비(#243, 서버에서 한 번).**

- Docker 와 compose 플러그인 설치. `ubuntu` 는 `docker` 그룹에 **넣지 않았다** — 서버의 docker 명령은 전부
  `sudo` 로 쓴다(`deploy.sh` 도 그렇게 부른다, 2026-10-15 확인)
- 홈에 `deploy/` — `.env` · `backend/.env` 는 **600**. 정본은 각각 `.env.example` · `backend/.env.example`
- `deploy/secrets/` 디렉터리 **700**, `tunnel_token` 파일 **644**(이유는 아래 「터널 토큰은 파일로 넘긴다」)
- `deploy/doc-figures/` — 매뉴얼 그림. 저장소에 없다(#228) — 운영 서버(또는 그 스냅샷)에서 복사하거나 `scripts/doc-figures/preprocess.py` 로
  원본 매뉴얼에서 다시 만든다. **그림 사본은 운영 디스크와 그 스냅샷뿐이다**
- 방화벽은 **22 만**, 고정 IP 를 붙인다
- 콘솔에서 **자동 스냅샷을 켠다**(아래 「백업」)

**서버를 옮길 때.** 같은 터널 토큰을 두 서버에서 동시에 돌리면 요청이 두 곳으로 갈라져
서로 다른 DB 에 쓰인다 — 그래서 **옛 서버의 `app` 과 `cloudflared` 를 먼저 멈추고**, DB 덤프 · `uploads` · `doc-figures` 를
옮겨 복원한 **뒤에** 새 서버를 띄운다. 헬스체크와 e2e 를 확인하기 전에는 옛 서버를 지우지 않는다(되돌릴 길이다).

**서버는 이미지를 빌드하지 않는다(#127).** `docker-compose.yml` 의 `app` 에 `build` 가 없고
`image: rag-chatbot-backend:latest` 만 있다. 처음(1GB 서버)에는 build 스테이지의 Maven JVM
하나로 물리 메모리를 넘겼고, 4GB 로 옮긴 뒤(#243)에도 서버에 빌드 도구를 들이지 않으려 구조를 유지한다. **절차로 막지 않고 키를 없앴다** — 본체에 `build` 를 남겨
두면 이미지를 못 찾았을 때 `up` 이 조용히 빌드로 빠지는 경로가 남는다.

**이미지는 레지스트리를 거치지 않는다.** `scripts/deploy.sh` 가 로컬에서 빌드해
`docker save` → `scp` → `docker load` 로 서버에 넣는다. 압축 후 90MB 남짓이고 Lightsail 월 전송량(4TB)
안이다.

**GHCR 을 쓰지 않는다** — 직접 전송은 토큰도 정리 정책도 필요 없고, 서버가 하나뿐이라 레지스트리의 이점을 쓸 데가 없다(경위는 CHANGELOG #137).

**CI 는 이미지를 만들지 않는다.** `docker` 잡은 종전대로 **빌드만 하고 버린다** — 배포 산출물이
조용히 썩는 것을 막는 검증이다. 배포본을 만드는 것은 `scripts/deploy.sh` 뿐이다.

**감수하는 약점** : 레지스트리에 이미지 이력이 남지 않는다. `deploy.sh` 는 load 직전 이전 이미지를
`rag-chatbot-backend:previous` 로 태그해 두고, **헬스체크가 실패하면** 그 태그로 되돌리는 명령을 출력한다.
**헬스체크가 통과하면 `:previous` 를 지운다** — 성공한 배포 뒤에 되돌리려면 배포 전에 손으로 남긴 태그
(예 : `sudo docker tag rag-chatbot-backend:latest rag-chatbot-backend:prev-<sha>`)가 있어야 하고,
없으면 **그 커밋을 다시 빌드해야 한다.**
배포가 잦지 않은 단일 서버 전제에서 감수한다. GHCR 안으로 되돌아가면 바뀌는 것은 `image:` 한 줄과 이 문단뿐이다.

로컬에서 직접 빌드해 띄우려면 override 를 겹친다 :

```
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build db app
```

**이미지 빌드는 `mvnw` 를 쓰지 않는다.** build 스테이지가 `maven:3.9.16-eclipse-temurin-17-alpine` 이라
Maven 이 이미지 안에 있다. wrapper 를 쓰면 빌드마다 배포판 zip 을 Maven Central 에서 내려받는데,
의존성 해석보다 앞선 단계라 레이어 캐시로도 덮이지 않고 Central 이 거절하면 이미지 빌드가 통째로 멎는다.
버전은 wrapper 가 쓰던 3.9.16 과 같게 고정했고, `mvnw` 자체는 로컬·CI 용으로 그대로 남는다.
**이 근거가 지켜 주는 자리는 CI 와 개발 PC 다** — 서버는 빌드하지 않는다. CI 의 `docker` 잡이
이미지가 여전히 빌드되는지만 보고, 실제 배포본은 `scripts/deploy.sh` 가 로컬에서 만든다.
**의존성 해석은 여전히 Central 을 타므로** 그쪽은 재시도 두 번으로 덮는다 — 없앤 것은 배포판이라는 한 홉이다.
멀티스테이지라 최종 이미지는 `eclipse-temurin:17-jre-alpine` 그대로이며, 실측 크기 차이는 45바이트였다.

**메모리 상한을 셋 다 걸어 두었다(#127).** 현재 실측(Lightsail, 2026-10-12, 기동 직후)은 `app` 151MiB / 1g ·
`db` 27MiB / 512m · 시스템 여유 2.9Gi 이다. 상한은 `app` 1g · `db` 512m · `cloudflared` 64m 이고(#243), Postgres 튜닝 값은 호스트가 넓어졌다고 일부러 키우지 않았다. `app` 은 `MaxRAMPercentage=65` · `UseSerialGC` 로, `db` 는 `shared_buffers=48MB` ·
`max_connections=20` 으로 묶었다. Hikari 풀은 `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=5` 로
줄였다 — `application.yml` 에 hikari 설정이 없어 기본값이 10 이다. `memswap_limit` 은 `app` 만 `mem_limit` 과 같게(스왑 금지) 걸었다(#202) — 근거는
아래 「업로드 부하에서 스왑을 금지하기로 정했다」.

**첨부 파일은 로컬 디스크에 저장한다.** compose 의 `uploads` 볼륨이 `/data/uploads` 를 받으며,
이 볼륨을 떼면 업로드된 이미지가 사라진다. 볼륨을 쓸 수 없는 환경이면 `FileStorage` 구현을
S3 등으로 교체해야 한다.

**컨테이너를 하드닝했다(#130).** 종전에는 `security_opt` · `cap_drop` · `read_only` · `pids_limit`
이 **하나도 없어** 세 컨테이너가 Docker 기본 capability 14개를 그대로 들고 돌았다. 단일 VM 에
전부 모으는 구성이라 침해 하나가 전부를 먹는 형태였다.

| 설정 | `app` | `db` | `cloudflared` |
|------|-------|------|---------------|
| `no-new-privileges` | ✅ | ✅ | ✅ |
| `cap_drop: ALL` | ✅ (추가 없음 — **capability 0개**) | ✅ + 최소 4개 | ✅ |
| `read_only` | ✅ + `/tmp` tmpfs 64m | — (postgres 가 런타임에 쓴다) | — (동작 검증 불가, 아래 참고) |
| `pids_limit` | 288 | 128 | 64 |
| 로그 회전 | 10m × 3 | **10m × 3 (신규)** | **10m × 3 (신규)** |
| 네트워크 | `backend` + `edge` | `backend` | `edge` |

**`db` 의 `cap_add` 네 개는 추측이 아니라 실측이다.** `DAC_OVERRIDE` · `FOWNER` · `SETUID` ·
`SETGID` 다. 처음에는 `CHOWN` 까지 다섯 개로 잡았는데 **빼도 정상 기동한다** — 이미지의
`/var/lib/postgresql/data` 가 이미 postgres 소유라 신규 named volume 이 그 소유권을 물려받아
chown 할 일이 없다. `DAC_OVERRIDE` 를 빼면 `find` 가 디렉터리를 못 읽어 초기화가 멎고,
`FOWNER` 를 빼면 **healthy 에는 닿지만 `chmod` 가 조용히 실패한다**(그래서 넣어 둔다).

**검증은 기존 볼륨으로 하면 거짓 통과한다.** 깨지는 자리가 postgres **초기화 경로**인데 이미
초기화가 끝난 `pgdata` 는 그 경로를 타지 않는다. 그래서 매 항목마다 `down -v` 로 볼륨을 버리고
초기화를 실제로 태워 확인했다. 서버가 중지되어 있어도 이렇게 검증할 수 있는 것은
**`scripts/deploy.sh` 가 저장소의 `docker-compose.yml` 을 그대로 서버로 올려** 로컬과 운영이
같은 파일을 쓰기 때문이다.

**운영 VM 에서도 같은 값을 실측했다(2026-10-06, Lightsail 첫 기동에서 2026-10-12 다시).** 로컬 확인은 커널이 달라(Docker Desktop ↔ Ubuntu) 대체에
그쳤는데, 런칭 첫 배포가 **빈 볼륨**이라 위의 「거짓 통과」 걱정 없이 postgres 초기화 경로가 Ubuntu 커널에서 실제로 탔고
권한 오류 없이 `init process complete` 까지 갔다(#130). 커널이 들고 있는 값(`/proc/1/status`)이 로컬과 같다 — `CapBnd` db `00000000000000ca` · app · cloudflared
`0`, `NoNewPrivs` 셋 다 1. `app` 의 `/data/uploads` · `/tmp` 쓰기는 되고 `/app` 은 `Read-only file system`,
`edge` 에서 `db` 는 이름 해석부터 실패하고 `app:8080` 은 닿는다. 로그 회전 · `pids_limit` · 다이제스트도
설정대로이고 재시작 0회다. 원본은 `.issue/130/evidence/after/07-vm-runtime-20261006.txt`.

**네트워크를 둘로 나눴다.** `backend`(db↔app)와 `edge`(app↔cloudflared)다. 터널 컨테이너는
바깥과 말하는 유일한 컨테이너라 침해 표면이 가장 넓은데, 그쪽에서 DB 포트가 보일 이유가 없다.
확인은 `edge` 에만 붙인 임시 컨테이너에서 `db` 가 **이름 해석조차 되지 않는** 것으로 했다.
`backend` 를 `internal: true` 로 만들지는 않았다 — db 의 아웃바운드까지 끊는 것은 이 이슈가
요구한 분리를 넘어서고 새 실패 모드를 들인다.

**`cloudflared` 는 capability 0개로 정상 동작한다.** 하드닝 당시에는 토큰이 자리표시자라 「설정이
걸렸다」까지만 확인했는데, 운영에 실제 토큰을 넣은 뒤(2026-10-06) **터널 4연결**이 붙고
`https://api.chseong.fyi/api/health` 가 200 이다.

**`cloudflared` 이미지를 다이제스트로 고정했다(#130).** 이 저장소는 서드파티 액션을 커밋 SHA 로
고정할 만큼 공급망을 신경 쓰는데 컨테이너 이미지만 `latest` 였다. 표류는 가설이 아니다 —
고정하던 날 로컬의 `latest`(2026-09-09 빌드)와 레지스트리의 `latest`(2026-09-11 빌드)가 **이미
서로 달랐다.** 올릴 때는 다이제스트를 바꾸는 커밋으로 올린다. (`postgres:16-alpine` 도 움직이는
태그지만 이번 범위가 아니다 — 별도로 판단할 것.)

**서버의 `.env` 권한은 `deploy.sh` 가 600 으로 고정한다(#130).** 이 파일들에는 `JWT_SECRET` ·
`OPENAI_API_KEY` · `DB_PASSWORD` 가 평문으로 있고(터널 토큰은 #203 에서 `secrets/` 파일로 옮겼다 — 아래),
기본 umask 로 만들면 644 가
되어 **서버에 셸이 닿는 누구나 읽는다.** 런북에만 적으면 사람이 기억해야만 지켜지므로
프리플라이트에서 확인하고 고치며, 무엇을 바꿨는지 출력한다.

**장애 대응 중 `docker inspect` 출력을 그대로 공유하지 말 것(#130).** `env_file` 과
`environment:` 로 넘어간 값은 `/var/lib/docker/containers/<id>/config.v2.json` 에 평문으로 굳어
`Config.Env` 에 전부 남는다. 사람은 보통 `State` 나 `Mounts` 를 보려고 전체를 복사하는데
그 JSON 안에 비밀이 같이 있다 — 한 번에 JWT 서명키(전 사용자 위장) · OpenAI 키(과금) ·
터널 토큰(도메인 트래픽 탈취)이 함께 나간다. 필요한 필드만 `--format` 으로 뽑아 쓴다.
터널 토큰은 #203 에서 이 경로에서 뺐다(아래). **JWT 서명키 · OpenAI 키 · DB 비밀번호는 여전히 env 로 들어가
노출된다** — 앱이 환경변수로 읽는 구조라 별도 판단 대상이다.

**터널 토큰은 파일로 넘긴다(#203).** `cloudflared tunnel run --token-file /run/secrets/tunnel_token` 에
compose `secrets`(파일)로 마운트한다. 고정한 이미지(2026.10.0)가 `--token-file` 을 지원한다.
**권한 조합이 일반적인 비밀 파일과 다르다** — swarm 이 아닌 compose 의 secrets 는 바인드 마운트라 `uid`·`mode`
지정이 먹지 않고 호스트 권한이 그대로 보인다. cloudflared 는 65532 로 돌아 **파일이 600 이면 못 읽는다**
(`permission denied`, 운영 VM 에서 음성 대조로 확인). 그래서 파일은 644, 대신 **디렉터리 `secrets/` 를 700** 으로
막아 호스트의 다른 사용자는 경로부터 들어오지 못한다. `deploy.sh` 프리플라이트가 파일이 있는지 보고 디렉터리를
700 으로 고정한다. 파일이 없으면 compose 가 기동 전에 멈춘다.

**업로드 부하에서 스왑을 금지하기로 정했다(#202 — `memswap_limit` = `mem_limit`).**
스왑을 허용하면 유휴 중 밀려난 JVM 힙을 첫 요청이 swap-in 으로 도로 읽어 느려지고(실측 39.1초), 끄면 상주 집합이 남고
한도를 넘기면 디스크를 녹이는 대신 빨리 죽고 재시작한다. `app` 은 `mem_limit`/`memswap_limit` 모두 1g 다.
원본 수치는 이슈 [#202](https://github.com/changs0124/rag-chatbot/issues/202) 코멘트에 있다.

**백업은 Lightsail 자동 일일 스냅샷이다(#243).** 단일 인스턴스 · 단일 디스크라
`pgdata` · `uploads` · 이미지 · 로그가 같은 80GB 에 있다. 2026-10-12 결정으로 콘솔에서 **자동 스냅샷**(매일 · 최근 7개 보관 ·
GB-월 과금)을 켜고, 종전 GCS 백업 스크립트는 삭제했다.
관리할 키도 cron 도 없다는 것이 이유다. 대신 **감수하는 약점**이 셋이다 :

| 약점 | 뜻 |
|------|-----|
| 디스크 통째로만 복구 | 표 하나만 `pg_restore` 로 되돌리는 것이 안 된다. 어제 지운 행 하나를 살리려면 스냅샷으로 새 인스턴스를 만들어 거기서 꺼내야 한다 |
| 같은 공급자 | 오프사이트가 아니다. 계정 · 리전 사고에는 무용하다 |
| crash-consistent | 실행 중 디스크를 찍는다. Postgres 는 WAL 로 복구하므로 기동하면 일관된 상태로 올라오지만, 스냅샷 직전 커밋 순간까지의 일관성이지 앱 수준 정지점이 아니다 |

**복구(운영 서버가 죽었을 때)** : 콘솔에서 스냅샷으로 **새 인스턴스를 만든다**(같은 번들 · 같은 가용 영역) → 고정 IP 를 옮겨 붙인다
(또는 `~/.ssh/config` 의 `HostName` 교체) → 새 인스턴스는 SSH 호스트 키가 바뀌므로 `ssh-keygen -R <고정 IP>` 후 새 지문을 확인하고 접속 →
헬스체크. **컨테이너는 부팅과 함께 `restart: unless-stopped` 로 저절로 뜬다** — `docker compose up -d` 를 칠 일이 없다.
그래서 **옛 인스턴스를 먼저 멈춰야** 한다 : 새 인스턴스의 cloudflared 가 부팅 몇 초 안에 같은 터널 토큰으로 붙는다(「서버를 옮길 때」와 같은 이유).
새 인스턴스의 기본 방화벽은 22 · 80 을 연다 — 80 을 닫는다.
산출물에는 **사용자 이메일 · BCrypt 해시 · 전체 대화**가 들어 있어 스냅샷 공유 · 복사 권한을 열지 않는다.

**리허설(운영을 살려 둔 채 복구를 확인할 때, #255 · 2026-10-15)** — 운영 터널에 붙지 않게 하는 것이 전부다.

- `create-instances-from-snapshot --use-latest-restorable-auto-snapshot` 에 **launch script**(user-data)로 `secrets/tunnel_token` 이름 바꾸기 ·
  `docker update --restart=no deploy-cloudflared-1` · `docker stop deploy-cloudflared-1` 을 넘긴다. 스크립트는 **ASCII 만** — 한글 주석이 있으면 Windows AWS CLI 가 파일을 못 읽는다
- **launch script 는 docker 보다 늦게 돈다.** 실측 : 부팅 뒤 cloudflared 가 연결 4개를 먼저 등록했고 스크립트가 끊기까지 **약 3초 운영 터널에 같이 붙었다.**
  그 사이 들어온 요청은 시험 서버(스냅샷 시점 DB)로 갈 수 있으므로 **사용자가 없는 시간에** 하고, 접속 즉시 `docker ps` 로 cloudflared 가 꺼졌는지 본다
- 확인 : `127.0.0.1:8080/api/health` 200 · 표 7개 행 수를 운영의 **스냅샷 시각 이전 생성분**(`created_at`/`installed_on` < 스냅샷 `createdAt`)과 대조 — 2026-10-15 전부 일치.
  요청부터 헬스 200 까지 **2분 13초**, 앱 기동은 58초(운영 9초 — 스냅샷 디스크의 첫 읽기가 느리다)
- 끝나면 인스턴스를 지우고 `get-instances` · `get-static-ips` · `get-disks` 로 남은 것이 없는지 본다. 고정 IP 는 붙이지 않는다(분리된 고정 IP 는 과금)

> 종전 GCS 백업 설계와 복구 리허설은 #132 · CHANGELOG 에 있다.

### 데모 - 로컬 + 터널

프론트는 Vercel(https)에 있고 백엔드는 로컬이므로 `http://공인IP:8080` 직결은 성립하지 않는다 —
https 페이지가 http 를 부르면 브라우저가 mixed content 로 막는다. 터널이 https 종단을 대신 맡는다.

1. 백엔드를 평소대로 띄운다(`./mvnw spring-boot:run`, `:8080`).
   **이 경로는 `backend/.env` 를 읽지 않는다** — dotenv 로더가 없어 환경변수를 셸에 직접 넣어야 한다.
   `.env` 를 그대로 쓰려면 `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build db app`
   으로 띄운다 — 본체에는 `build` 가 없어 override 를 겹쳐야 로컬 빌드가 성립한다(#127)
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
