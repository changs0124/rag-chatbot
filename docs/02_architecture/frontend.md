# Frontend Architecture

React 19 + TypeScript + Vite 8 + Tailwind CSS 4. 반응형 웹(PC·모바일 브라우저) 단일 SPA.
전체 시스템 그림과 API 목록은 [overview](./overview.md)에 있다. 여기서는 프론트 내부 설계만 다룬다.

## 폴더 구조

| 경로 | 역할 |
|------|------|
| `frontend/src/pages/` | 라우트 단위 화면 — `ChatPage` · `LoginPage` · `MyPage` |
| `frontend/src/components/` | 재사용 컴포넌트. 기능이 커지면 `components/chat/` 처럼 하위 폴더 |
| `frontend/src/hooks/` | 도메인 훅 — 현재 `useChat.ts` 하나 |
| `frontend/src/lib/` | `api.ts`(fetch 래퍼·토큰) · `endpoints.ts`(엔드포인트 함수·SSE 파서) · `types.ts`(공유 타입) |
| `frontend/src/auth/` · `frontend/src/theme/` | Context Provider |
| `frontend/src/test/` | Vitest 셋업 |

## 라우팅

`frontend/src/App.tsx` (React Router 8).

| 경로 | 화면 | 보호 |
|------|------|------|
| `/login` | `LoginPage` — 로그인·회원가입 한 화면(모드 토글) | 공개 |
| `/` | `ChatPage` | `ProtectedRoute` |
| `/me` | `MyPage` | `ProtectedRoute` |
| 그 외 | `/` 로 리다이렉트 | 해당 없음 |

`frontend/src/components/ProtectedRoute.tsx` 는 세 갈래다 — `loading` 중이면 로딩 표시, 끝난 뒤 사용자가 없으면
`/login` 으로 리다이렉트, 있으면 자식을 렌더한다. 검증이 끝나기 전에 판정하지 않는 것이 요점이다.

## 상태관리

**외부 상태 라이브러리를 쓰지 않는다.** 서버 캐시 라이브러리(react-query 등)도 없다.
화면이 3개뿐이고 공유 상태가 인증·테마 둘이라, 라이브러리 도입이 이득보다 크지 않다고 봤다.

| 상태 | 보유자 | 비고 |
|------|--------|------|
| 로그인 사용자 | `frontend/src/auth/AuthContext.tsx` | 기동 시 `/api/auth/me` 로 토큰 유효성 확인. 실패하면 토큰 폐기 |
| 테마 | `frontend/src/theme/ThemeContext.tsx` | `localStorage` + 계정 설정. `system` 이면 `prefers-color-scheme` 변화를 구독 |
| 대화·메시지·스트리밍 | `frontend/src/hooks/useChat.ts` | 대화 목록, 활성 대화, 메시지 배열, 스트리밍 여부, 진행 단계, 오류를 한 훅이 보유 |
| 인증 토큰 | `frontend/src/lib/api.ts` 모듈 변수 + `localStorage` | React 상태가 아님 — 렌더링과 무관하게 요청 시점에 읽혀야 함 |

로그인·테마 순서가 얽혀 있다 : `AuthProvider` 가 `useTheme()` 을 쓰므로 `ThemeProvider` 가 바깥에 있어야 한다
(`frontend/src/main.tsx`). 계정에 저장된 테마를 로그인 직후 적용하기 위한 배치다.

## API 통신

- 컴포넌트가 `fetch` 를 직접 부르지 않는다. `frontend/src/lib/api.ts` 의 `api.get/post/patch/del/postForm` 만 쓴다.
- 엔드포인트는 `frontend/src/lib/endpoints.ts` 에 한 줄 함수로 노출한다.
- 실패는 `ApiError(status, message)` 로 통일하고, 서버가 준 `message` 를 그대로 사용자에게 보여준다.
- 비밀번호 변경 응답의 **새 토큰으로 반드시 교체**해야 한다. 서버가 변경 시각 이전 토큰을 전부 무효화하므로,
  교체하지 않으면 "변경했습니다"를 띄운 직후부터 모든 요청이 401 이 된다.

### 채팅 스트림 수신

`EventSource` 가 아니라 **fetch + ReadableStream** 이다 — `EventSource` 는 `Authorization` 헤더를 실을 수 없다.
`streamChat` 이 `\n\n` 경계로 SSE 프레임을 잘라 `meta → stage* → token* → citations → done` 을 콜백으로 흘린다.

첨부 이미지는 `<img src>` 가 헤더를 못 실으므로 **쿼리 서명 토큰이 붙은 URL**을 쓴다. 이 URL 은 재조회 시점에
서버가 새로 서명하므로 저장해 두고 재사용하지 않는다.

## 스트리밍 UI 규칙

`useChat` 이 지키는 계약이며, 어기면 화면과 재조회 결과가 어긋난다.

- **진행 단계는 최소 표시 시간(350ms)만큼 붙잡는다.** 목업은 단계가 같은 순간에 도착해 표시 시간이 0이 된다.
  없는 단계를 만들거나 순서를 바꾸지는 않는다 — 실제 도달한 단계에만 시간을 준다.
- **단계를 보여주는 동안에는 답변 버블을 내지 않는다.** 단계가 끝나면 그 자리가 답변 텍스트로 교체된다.
- **대화를 떠나면 돌던 스트림을 끊는다.** 안 끊으면 이전 대화의 단계 줄이 새 화면에 잔류한다.
- **중단은 오류가 아니다.** 받은 데까지 `complete` + `stopped` 로 두고, 받은 것이 없으면 빈 버블을 남기지 않는다
  (서버도 부분 텍스트가 비면 저장하지 않으므로, 남기면 새로고침에 사라져 어긋난다).
- **`onDone` 이 확정한 메시지는 이후 경로에서 건드리지 않는다.** 서버가 정상 저장한 답변에 `stopped` 를 세우면
  화면(배너 없음)과 재조회(배너 있음)가 갈린다.
- **무자료 배너는 텍스트 접두가 아니라 "출처 0건"에서 파생한다.** 스트리밍 중과 중단된 답변에는 붙이지 않는다.

## 스타일·테마

- Tailwind 유틸리티 클래스만 쓴다. CSS 모듈·CSS-in-JS 없음. 전역 CSS 는 `frontend/src/index.css` 뿐이다.
- 다크 모드는 `html[data-theme="dark"]` 기준 커스텀 variant 다. 컴포넌트는 `dark:` 접두를 그대로 쓰되
  `prefers-color-scheme` 을 직접 참조하지 않는다 — 시스템 설정 해석은 `ThemeProvider` 가 단독으로 한다.

## 오류 경계

`frontend/src/components/ErrorBoundary.tsx` 가 앱 전체를 감싼다(`frontend/src/main.tsx`).
렌더 중 예외로 화면이 백지가 되는 것을 막고 다시 시도 경로를 준다.

## 테스트

Vitest + Testing Library. 테스트는 **소스 옆에** 둔다(`useChat.test.ts`, `LoginPage.test.tsx`). 실행은 `npm test`.
현재 8개 파일 32 케이스이며 하한은 `scripts/case-floors.env` 가 잠근다.

## 배포 (Vercel)

현재 배포 : https://rag-chatbot-jade-pi.vercel.app (프로젝트 `rag-chatbot`, 스코프 `changs0124s-projects`)

`frontend/vercel.json` 이 빌드 명령·출력 디렉터리와 **SPA 리라이트**를 고정한다. 리라이트가 없으면
`/me` 를 직접 열거나 새로고침할 때 404 가 난다 — 라우팅을 `BrowserRouter` 가 하기 때문이다.

### GitHub 연동은 아직 수동 단계가 남아 있음

첫 배포는 파일을 직접 올려 만들었다. **저장소가 연결돼 있지 않아 푸시해도 자동 배포되지 않는다.**
연결하려면 Vercel 대시보드에서 :

1. 프로젝트 → Settings → Git → Connect Git Repository → `changs0124/rag-chatbot`
   (private 저장소이므로 Vercel GitHub App 설치 승인이 필요함)
2. **Root Directory 를 `frontend` 로 지정** — 모노레포라 이걸 빼면 루트에서 빌드를 시도해 실패한다
3. 연결 후 첫 배포부터는 저장소의 `package-lock.json` 으로 빌드되므로 CI 와 같은 의존성이 잡힌다

배포 전 반드시 할 것 :

1. Vercel 프로젝트 환경변수에 `VITE_API_BASE_URL` = 백엔드 공개 주소를 넣는다.
   빠뜨리면 번들이 `localhost` 를 호출해 전부 실패한다(빌드 결과물이 콘솔에 경고를 남긴다).
   Vite 는 이 값을 **빌드 시점에 치환**하므로, 값을 바꾸면 재배포해야 한다.
2. 백엔드의 `ALLOWED_ORIGINS` 에 Vercel 도메인을 넣는다. 안 넣으면 브라우저가 모든 호출을 CORS 로 막는다.

토큰은 `localStorage` 에 둔다. 만료되면 어떤 요청에서든 세션을 비우고 로그인으로 돌아간다
(`setUnauthorizedHandler`). 단 로그인·회원가입·비밀번호 변경의 401 은 "자격 증명이 틀렸다"는 뜻이라
세션을 유지한다 — 그러지 않으면 비밀번호 오타 한 번에 로그아웃된다.
