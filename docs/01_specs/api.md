# API 명세서

| 항목 | 내용 |
|------|------|
| 프로젝트 | rag-chatbot |
| 문서 버전 | v1.0 |
| 최종 수정일 | 2026-09-02 |
| 작성자 | changs0124 |
| 상태 | `초안` |

---

> **템플릿과 다른 점** — 템플릿 기본값은 `{success, data, message, timestamp}` 래핑 · `/api/v1` ·
> 권한 없음 403 · 리프레시 토큰이다. 이 저장소는 **래핑 없는 원시 DTO · `/api` · 404 은닉 ·
> 슬라이딩 재발급**이다. 사유는 각 절에 적는다.
>
> 컨트롤러 정본은 `backend/src/main/java/com/ragchatbot/web/` 다.

## 1. API 공통 규칙

### Base URL

| 환경 | URL |
|------|-----|
| 개발 | `http://localhost:8080` |
| 배포 | 자체 호스팅(우분투) + Cloudflare Tunnel — 터널 도메인은 배포 시 정해진다. 절차와 선정 근거는 [backend.md](../02_architecture/backend.md) 「배포」 |

**버전 세그먼트(`/v1`)를 두지 않는다.** 단일 클라이언트가 단일 백엔드를 부르는 사내 도구라
버전 협상 상대가 없다. 프론트와 백엔드가 같은 저장소에서 함께 배포된다.

### 인증

- 방식 : JWT Bearer Token
- 헤더 : `Authorization: Bearer {token}`
- 만료 : 기본 120분 (`JWT_EXPIRATION_MINUTES`)
- 갱신 : **슬라이딩 재발급** — 남은 수명이 임계 미만이면 응답 헤더 `X-Refresh-Token` 에 새 토큰이 실린다 (FEAT-OPS-003)

**리프레시 토큰이 없다.** 별도 토큰·테이블·회전을 두는 대신 응답 헤더로 교체한다.
`refresh_tokens` 테이블도 `POST /auth/refresh` 엔드포인트도 존재하지 않는다.

**토큰 무효화** : 비밀번호가 바뀌면 `password_changed_at` 이 올라가고, 그 이전에 발급된 토큰은
전부 거부된다. stateless JWT라 서버가 회수할 수 없어 요청마다 기준선을 대조한다.

**예외 — 첨부 서빙만 Bearer가 아니다.** `<img src>` 가 Authorization 헤더를 실을 수 없어
쿼리 문자열의 서명 토큰으로 검증한다 (TTL 15분, 조회 시점마다 재발급).

### 공통 응답 포맷

**래퍼가 없다.** 성공 응답은 DTO를 그대로 돌려준다.

```json
{ "id": "…", "title": "새 대화", "createdAt": "2026-08-19T…" }
```

**`{success, data, message}` 로 감싸지 않는 이유** : HTTP 상태 코드가 이미 성공/실패를 말한다.
`success` 필드는 상태 코드와 중복이고, 둘이 어긋나면 어느 쪽이 참인지 알 수 없게 된다.

### 에러 응답 포맷

```json
{ "code": "NOT_FOUND", "message": "대화 없음" }
```

두 필드뿐이다. `timestamp` 는 응답 헤더에 이미 있고, `path` 는 요청한 쪽이 안다.

**프론트는 `message` 를 그대로 사용자에게 보여준다.** 따라서 서버 메시지는 사용자가 읽을 수 있는
한국어여야 하고, **내부 정보(SQL·클래스명)를 담아서는 안 된다.**

| code | HTTP | 발생 지점 |
|------|------|----------|
| `BAD_REQUEST` | 400 | 검증 실패 · 파일 형식/크기 |
| `UNAUTHORIZED` | 401 | 자격 증명 불일치 |
| `NOT_FOUND` | 404 | 리소스 없음 **또는 소유권·권한 위반 은닉** |
| `CONFLICT` | 409 | 이메일 중복 |
| `PAYLOAD_TOO_LARGE` | 413 | 멀티파트 하드 한도 초과 |
| `RATE_LIMIT` | 429 | 분당 상한 · 동시 스트림 상한 |
| `INTERNAL_ERROR` | 500 | **예상하지 못한 예외**. 본문에 상관 ID가 실림(FEAT-OPS-002) |

### HTTP 상태 코드

| 코드 | 의미 | 이 저장소에서 |
|------|------|--------------|
| 200 | 성공 | |
| 201 | 생성 성공 | 대화 생성 · 첨부 업로드 · 문서 업로드 |
| 204 | 본문 없음 | 삭제류 |
| 400 | 잘못된 요청 | |
| 401 | 인증 실패 | 토큰 없음·만료·무효 |
| **403** | — | **쓰지 않는다** |
| 404 | 리소스 없음 | **권한 없음도 여기로 보낸다** |
| 409 | 충돌 | |
| 413 | 용량 초과 | |
| 429 | 요청 과다 | |
| 500 | 서버 오류 | |

**403을 쓰지 않는 이유(P-3)** : 403은 "거기 뭔가 있다"를 알려준다. 남의 대화 id를 넣어 403이 오면
그 대화가 존재한다는 뜻이 된다. 관리자 기능도 마찬가지로 존재 자체를 드러내지 않는다.
**일반적인 REST 관행과 다르며 의도된 선택이다.**

## 2. API 목록

`인증` 열의 `-` 는 공개, `USER` 는 로그인, `ADMIN` 은 관리자 권한이다.

| ID | 메서드 | 경로 | 설명 | 인증 | 상태 |
|----|--------|------|------|------|------|
| API-GET-001 | GET | `/api/health` | 헬스체크 | - | 구현됨 |
| API-POST-001 | POST | `/api/auth/signup` | 회원가입 | - | 구현됨 |
| API-POST-002 | POST | `/api/auth/login` | 로그인 | - | 구현됨 |
| API-GET-002 | GET | `/api/auth/me` | 현재 사용자 | USER | 구현됨 |
| API-GET-003 | GET | `/api/profile` | 프로필 조회 | USER | 구현됨 |
| API-PATCH-001 | PATCH | `/api/profile/name` | 이름 변경 | USER | 구현됨 |
| API-PATCH-002 | PATCH | `/api/profile/password` | 비밀번호 변경 → **새 토큰** | USER | 구현됨 |
| API-PATCH-003 | PATCH | `/api/profile/theme` | 테마 변경 | USER | 구현됨 |
| API-GET-004 | GET | `/api/conversations` | 대화 목록 | USER | 구현됨 |
| API-POST-003 | POST | `/api/conversations` | 대화 생성 | USER | 구현됨 |
| API-PATCH-004 | PATCH | `/api/conversations/{id}` | 제목 변경 | USER | 구현됨 |
| API-GET-005 | GET | `/api/conversations/{id}/messages` | 메시지 목록 | USER | 구현됨 |
| API-DELETE-001 | DELETE | `/api/conversations/{id}` | 대화 삭제 | USER | 구현됨 |
| API-POST-004 | POST | `/api/files` | 첨부 업로드 (multipart) | USER | 구현됨 |
| API-DELETE-002 | DELETE | `/api/files/{id}` | 첨부 삭제 | USER | 구현됨 |
| API-GET-006 | GET | `/api/files/{id}?token=…` | 첨부 서빙 | **서명 토큰** | 구현됨 |
| API-POST-005 | POST | `/api/chat` | 채팅 — **SSE 스트림** | USER | 구현됨 |
| API-GET-007 | GET | `/api/admin/documents` | RAG 문서 목록 | ADMIN | 구현됨 |
| API-POST-006 | POST | `/api/admin/documents` | RAG 문서 업로드 | ADMIN | 구현됨 |
| API-DELETE-003 | DELETE | `/api/admin/documents/{id}` | RAG 문서 삭제 | ADMIN | 구현됨 |
| API-GET-008 | GET | `/api/admin/users` | 사용자 목록 | ADMIN | 구현됨 |
| API-POST-007 | POST | `/api/admin/users/{id}/password-reset` | 임시 비밀번호 발급 | ADMIN | 구현됨 |

**페이지네이션이 없다.** 대화 목록·메시지 목록·문서 목록 모두 전량을 돌려준다. 사내 소규모 전제이며,
양이 늘면 그때 넣는다. 지금 넣으면 쓰이지 않는 파라미터가 계약에 남는다.

## 3. API 상세

### API-POST-001: 회원가입

**POST** `/api/auth/signup`

**Request Body:**
```json
{ "email": "hong@company.com", "password": "…", "name": "홍길동" }
```

**Response 200:** 로그인과 같은 형태(`token` + `user`).

**Error Cases:**

| code | HTTP | 상황 |
|------|------|------|
| `BAD_REQUEST` | 400 | 이메일 형식 · 비밀번호 8자 미만 · 이름 공백 |
| `BAD_REQUEST` | 400 | **허용 도메인 밖**(FEAT-AUTH-001). 메시지에 허용 도메인을 밝힌다 |
| `CONFLICT` | 409 | 이미 가입된 이메일 |

**도메인 검사가 중복 검사보다 먼저다.** 순서가 바뀌면 거절할 주소에 대해 "이미 가입된 이메일"을
돌려주게 되어 **계정 존재 여부가 새어 나간다.**

`/api/auth/signup` 은 `permitAll` 이지만 **허용 도메인 밖이면 거절된다**(`ALLOWED_EMAIL_DOMAINS`).
관리자 승인과 이메일 인증은 여전히 없다 — 도메인 제한이 그 자리를 대신한다.

### API-POST-002: 로그인

**POST** `/api/auth/login`

**Request Body:**
```json
{ "email": "user@company.com", "password": "…" }
```

**Response 200:**
```json
{
  "token": "eyJhbGc…",
  "user": { "id": "…", "email": "user@company.com", "name": "홍길동", "theme": "system" }
}
```

**Error Cases:**

| code | HTTP | 상황 |
|------|------|------|
| `UNAUTHORIZED` | 401 | **계정 미존재와 비밀번호 불일치가 같은 응답이다** (존재 은닉) |
| `RATE_LIMIT` | 429 | 분당 로그인 시도 상한 초과. 키는 정규화된 이메일이며 IP가 아니다 |

**알려진 약점** : 미존재 계정은 BCrypt 검증을 건너뛰어 응답 시간이 갈리는 타이밍 오라클이 남는다.
응답 본문·상태 코드만 통일돼 있다.

### API-PATCH-002: 비밀번호 변경

**PATCH** `/api/profile/password`

**Request Body:**
```json
{ "currentPassword": "…", "newPassword": "…" }
```

**Response 200:** 로그인과 같은 형태(`token` + `user`).

**반드시 응답의 새 토큰으로 교체해야 한다.** 변경 이전 토큰은 전부 무효화되므로, 교체하지 않으면
방금 비밀번호를 바꾼 사용자가 즉시 로그아웃된다.

**Error Cases:**

| code | HTTP | 상황 |
|------|------|------|
| `UNAUTHORIZED` | 401 | **현재 비밀번호 불일치**. 세션 만료가 아니다 |

**프론트 주의** : 이 경로의 401은 "세션이 죽었다"가 아니라 "방금 넣은 값이 틀렸다"는 뜻이다.
여기서 로그아웃시키면 오타 한 번에 멀쩡한 세션이 날아간다. `frontend/src/lib/api.ts` 가
`CREDENTIAL_PATHS` 로 이 경로들을 예외 처리한다.

### API-POST-005: 채팅 (SSE)

**POST** `/api/chat`

일반 JSON 응답이 아니라 **`text/event-stream`** 이다. `EventSource` 는 Authorization 헤더를 실을 수
없어 프론트가 `fetch` + `ReadableStream` 으로 직접 파싱한다.

**Request Body:**
```json
{ "conversationId": "…", "message": "취업규칙 알려줘", "attachmentIds": ["…"] }
```

**이벤트 순서:** `meta` → `stage`* → `token`* → `citations` → `done` (또는 `error`)

| event | data | 설명 |
|-------|------|------|
| `meta` | `{ messageId, conversationId }` | 스트림 개시 |
| `stage` | `{ stage, label }` | 진행 단계. **실제로 지난 경계에서만 온다** |
| `token` | `{ delta }` | 답변 조각 |
| `citations` | `{ items: [{ seq, sourceName, snippet, uri }] }` | 출처 |
| `done` | `{ finishReason, noSource }` | 완료. `noSource=true` 면 인용 0건 |
| `error` | `{ code, message }` | 스트림 도중 오류 |

**검증은 동기, 스트리밍은 비동기다.** 400 · 404 · 429는 SSE 안의 `error` 이벤트가 아니라
**정상 HTTP 응답**으로 나간다. 스트림이 시작됐다는 것은 검증을 통과했다는 뜻이다.

**Error Cases:**

| code | HTTP | 상황 |
|------|------|------|
| `BAD_REQUEST` | 400 | 메시지도 첨부도 없음 |
| `NOT_FOUND` | 404 | 남의 대화 · 없는 첨부 |
| `RATE_LIMIT` | 429 | 분당 상한 **또는 동시 스트림 상한**. 큐에 쌓지 않고 즉시 거절한다 |

**중단은 오류가 아니다.** 사용자가 끊으면 받은 데까지 `status=complete` + `stopped=true` 로 저장한다.
부분 텍스트가 비면 아무것도 저장하지 않는다.

### API-GET-006: 첨부 서빙

**GET** `/api/files/{id}?token={서명토큰}`

**유일하게 Bearer를 쓰지 않는 엔드포인트다.** `<img src>` 가 헤더를 실을 수 없기 때문이다.

| 항목 | 값 |
|------|-----|
| 토큰 TTL | 15분 |
| 발급 시점 | 업로드 응답 · 메시지 재조회 시마다 **새로 서명** |
| 검증 실패 | **전부 404** (존재 은닉) |

**알려진 약점** : 페이지를 오래 열어둔 뒤 새로 그려지는 이미지가 만료로 깨질 수 있다.
백로그 「파일 URL 수명」 항목이다.

### API-GET-007 / API-POST-006 / API-DELETE-003: RAG 문서

**GET** `/api/admin/documents`

**Response 200:**
```json
[
  {
    "id": "…",
    "filename": "취업규칙.pdf",
    "byteSize": 2516582,
    "status": "completed",
    "uploadedByName": "김운영",
    "createdAt": "2026-08-19T…"
  }
]
```

**`uploadedByName` 만 싣고 이메일은 싣지 않는다.** 관리 화면에 불필요하게 개인정보를 늘리지 않는다.

**POST** `/api/admin/documents` — `multipart/form-data`, 필드명 `file`

| 항목 | 값 |
|------|-----|
| 허용 형식 | PDF · TXT · MD · DOCX |
| 최대 크기 | 50MB |
| 매직바이트 | **PDF만** 검사(`%PDF`) |

**Response 201:** 문서 DTO 하나.

**DELETE** `/api/admin/documents/{id}` → **204**. soft delete 이며 행은 남는다.

**Error Cases (3종 공통):**

| code | HTTP | 상황 |
|------|------|------|
| `NOT_FOUND` | 404 | **비관리자 접근** · 없는 문서 |
| `BAD_REQUEST` | 400 | 형식·크기·매직바이트 위반 |
| `BAD_REQUEST` | 400 | **`OPENAI_VECTOR_STORE_ID` 미설정** — 행을 만들지 않는다 |
| `INTERNAL_ERROR` | 502 | OpenAI 장애. 업스트림 실패를 500으로 뭉개지 않는다 |

### API-GET-008 / API-POST-007: 사용자 관리

**GET** `/api/admin/users`

**Response 200:** `[{ id, email, name, role, createdAt }]`
초기화 대상을 고르는 용도라 여기서는 이메일이 필요하다.

**POST** `/api/admin/users/{id}/password-reset`

**Response 200:**
```json
{ "temporaryPassword": "Xk7-mQ2p-9Vr4" }
```

**이 값은 한 번만 반환되고 저장되지 않는다.** 발급 즉시 대상 사용자의 `password_changed_at` 이
올라가 **기존 토큰이 전부 무효**가 된다.

**Error Cases:**

| code | HTTP | 상황 |
|------|------|------|
| `NOT_FOUND` | 404 | 비관리자 접근 · 없는 사용자 |

**자기 자신은 대상에서 제외한다.** 마이페이지에 비밀번호 변경이 이미 있고, 관리자가 자기 세션을
스스로 끊는 경로를 만들 이유가 없다.

## 4. 응답 헤더

| 헤더 | 언제 | 설명 |
|------|------|------|
| `X-Refresh-Token` | 토큰 만료가 임계 미만일 때 | 새 토큰. **CORS 노출 헤더에 등록해야 브라우저가 읽는다** (FEAT-OPS-003) |

**등록을 빠뜨리면 서버는 정상 발급하는데 프론트가 못 읽어 조용히 아무 일도 일어나지 않는다.**
실패가 눈에 띄지 않는 형태라 시나리오 케이스로 고정한다.
