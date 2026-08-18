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

## 첨부 UI 계약

입력창(`frontend/src/components/chat/Composer.tsx`)과 말풍선(`frontend/src/components/chat/MessageList.tsx`)이
지키는 규칙이며, 어기면 파일이 서버에 남거나 탭 메모리가 샌다.

- **첨부는 고르는 즉시 올린다.** 전송 시점에는 이미 올라간 `id` 만 넘어간다(`useChat.send` 는 업로드를 하지 않는다).
  서버가 이 모델을 전제로 설계돼 있다 — 업로드는 `message_id=null` 로 저장되고, 회수 크론이 고아를 가져간다.
- **올라가지 않은 첨부가 있으면 보내기를 막는다.** 업로드 중·실패 카드가 하나라도 있으면 전송 버튼이 비활성이다.
  막지 않으면 그 이미지가 빠진 채 나가는데 화면에는 카드가 남아 있어 사용자는 갔다고 읽는다.
- **카드를 지우면 서버에서도 지운다.** 진행 중이면 `AbortController` 로 끊고, 이미 올라갔으면 `DELETE /api/files/{id}` 를
  부른다. **끊은 뒤에 업로드가 성공해도 마찬가지로 지운다** — 중단은 요청을 끊을 뿐 서버가 이미 받은 것을 되돌리지 않는다.
  삭제가 실패해도 카드는 지운다(남은 파일은 고아 회수가 가져간다).
- **미리보기 URL 은 반드시 회수한다.** 회수 지점은 **카드 제거 · 전송 완료 · 컴포저 언마운트** 세 곳이다.
  `URL.createObjectURL` 은 문서가 살아 있는 동안 원본을 메모리에 붙잡으므로, 빠뜨리면 촬영·삭제를 반복할수록 샌다.
  눈으로 확인되지 않는 규칙이라 테스트가 유일한 게이트다(`Composer.test.tsx` 가 회수 호출을 단언한다).
- **카드에 파일명을 쓰지 않는다.** 파일명은 `alt` · `aria-label` 로만 남기고, 구분이 필요하면 눌러서 확대한다.
- **이미지가 아닌 파일은 받지 않는다.** `+` 메뉴는 사진 · 카메라 둘뿐이고, 드롭·붙여넣기로 들어온 비이미지도 버린다.
  서버가 받지 않는 것을 화면에 올려 두면 실패만 보여 주게 된다. 과거 메시지에 남은 문서 첨부는 그대로 표시한다.
- **확대 보기는 전송 전·후가 같은 컴포넌트다**(`frontend/src/components/chat/ImageLightbox.tsx`).
  `src` 가 로컬 objectURL 이냐 서명 URL 이냐만 다르다. 양 끝에서 순환하지 않는다 — 한 장짜리에서 같은 이미지가
  되돌아오면 넘어간 것으로 오해하게 된다. 내려받기는 `<a download>` 가 아니라 blob 으로 받아 저장한다
  (백엔드가 다른 오리진이라 브라우저가 `download` 를 무시하고 새 탭으로 연다).
- **확대 보기는 핀치 줌을 받는다.** 1~4배이고 1배 아래로는 줄지 않으며, 이미지를 넘기면 배율·위치를 초기화한다.
  이미지에 `touch-action: none` 을 주지 않으면 브라우저 기본 제스처가 먼저 먹어 핀치 이벤트가 오지 않는다.
- **드래그 오버레이는 진입/이탈을 센다.** `dragleave` 만 보고 걷으면 자식 요소를 지날 때마다 깜빡인다.

## 스타일·테마

- Tailwind 유틸리티 클래스만 쓴다. CSS 모듈·CSS-in-JS 없음. 전역 CSS 는 `frontend/src/index.css` 뿐이다.
- 다크 모드는 `html[data-theme="dark"]` 기준 커스텀 variant 다. `prefers-color-scheme` 을 직접 참조하지 않는다 —
  시스템 설정 해석은 `ThemeProvider` 가 단독으로 한다.
- **색은 토큰으로만 쓰고, 색에는 `dark:` 를 쓰지 않는다.** 토큰 값은 `index.css` 의 `:root` ·
  `[data-theme="dark"]` 에 CSS 변수로 두고 `@theme inline` 이 그 변수를 가리킨다. 그래서 `bg-surface` 한 번이면
  두 테마가 다 된다. `bg-white dark:bg-zinc-950` 처럼 짝으로 적으면 한쪽만 고쳐져 테마가 갈린다.
  - 면 : `canvas`(바탕) · `surface`(가라앉음) · `raised`(카드·입력창) · `line`(구분선)
  - 글 : `ink` · `ink-muted`, 강조 : `accent` · `accent-ink` · `accent-soft`, 경고 : `danger`
  - `dark:` 는 색이 아닌 것(반투명 겹침 세기 등)에만 남긴다
- **모션은 이징 하나로 통일한다** — `--ease-out-quint`(`cubic-bezier(0.16,1,0.3,1)`). `linear` · `ease-in-out` 을 쓰지 않고,
  값이 매 프레임 바뀌는 동작(사이드바 폭 드래그)에는 트랜지션을 걸지 않는다 — 손보다 늦게 따라와 고무줄처럼 보인다.
  `prefers-reduced-motion: reduce` 는 전역 CSS 가 받아 트랜지션을 1ms 로 줄인다.
- 본문 서체는 Pretendard(동적 서브셋)를 번들에 넣어 쓴다. CDN 을 새로 물리지 않는다.
- 한국어 본문은 `word-break: keep-all` 을 전역으로 받는다 — 조사 앞에서 줄이 갈리면 읽는 속도가 떨어진다.

### 화면 골격

- 화면 높이는 `100dvh` 다. `h-screen` 은 iOS 주소창이 접힐 때 입력창을 화면 밖으로 밀어낸다.
- 답변에는 배경을 깔지 않는다(ChatGPT · Claude 공통). 사용자 메시지만 `raised` 카드다 —
  긴 답변에 큰 색면이 깔리면 읽는 흐름이 끊긴다.
- 사이드바 폭은 `ResizableSidebar` 가 관장한다(200~420px, 기본 260px, `localStorage`).
  범위 밖 저장값은 무시하고 기본값으로 연다. 손잡이는 `role="separator"` 로 키보드에서도 조절된다.
  모바일 드로어에는 손잡이가 없다.
- 드로어가 열린 동안 뒤 화면 스크롤을 잠근다. 터치 대상은 44px 을 밑돌지 않는다.

## 오류 경계

`frontend/src/components/ErrorBoundary.tsx` 가 앱 전체를 감싼다(`frontend/src/main.tsx`).
렌더 중 예외로 화면이 백지가 되는 것을 막고 다시 시도 경로를 준다.

## 테스트

Vitest + Testing Library. 테스트는 **소스 옆에** 둔다(`useChat.test.ts`, `LoginPage.test.tsx`). 실행은 `npm test`.
현재 11개 파일 59 케이스이며 하한은 `scripts/case-floors.env` 가 잠근다.

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

백엔드를 로컬에 두고 터널로 노출하는 데모 구성이면 `VITE_API_BASE_URL` 이 터널 주소가 된다.
터널 주소가 바뀌면 환경변수만 고쳐서는 반영되지 않고 **재배포까지 해야 한다**(1번의 빌드 시점 치환 때문).
절차와 터널 도구 선택은 [backend.md](./backend.md) 「배포」 참고.

토큰은 `localStorage` 에 둔다. 만료되면 어떤 요청에서든 세션을 비우고 로그인으로 돌아간다
(`setUnauthorizedHandler`). 단 로그인·회원가입·비밀번호 변경의 401 은 "자격 증명이 틀렸다"는 뜻이라
세션을 유지한다 — 그러지 않으면 비밀번호 오타 한 번에 로그아웃된다.
