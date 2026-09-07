# Conventions

이 문서는 이 저장소의 **실제 코드에서 관찰된** 스타일·패턴 규칙이다. AI가 코드를 생성할 때 반드시 이 규칙을 따른다.
새 규칙을 만들지 말고, 손대는 파일의 주변 코드 스타일에 맞춘다.

## 공통

- **주석은 한국어**로 쓰고, **"무엇"이 아니라 "왜"** 를 적는다. 특히 결정을 뒤집은 이유·감수한 약점은 반드시 남긴다.
  (예: `backend/src/main/resources/db/migration/V3__message_stopped.sql` 머리 주석)
- 커밋하지 않는 값(시크릿·API 키)은 코드·문서·예시 파일에 값 자체를 적지 않는다. `*.env.example`에는 키 이름만 둔다.
- 'Generated with Claude Code' 류 AI 생성 서명 문구를 본문·커밋 어디에도 넣지 않는다.

## 백엔드 (Java · Spring Boot)

### 들여쓰기·포맷
- **탭** 들여쓰기. 중괄호는 K&R.
- import는 와일드카드 없이 개별 명시.

### 패키지 구조
레이어별 패키지 표는 [backend.md](./02_architecture/backend.md) 「레이어」가 정본이다.
**새 클래스는 그 표의 자리에 넣고, 표에 없는 레이어를 새로 만들지 않는다.**

### 네이밍
- 클래스 PascalCase, 메서드·필드 camelCase, 상수 UPPER_SNAKE_CASE
- 컨트롤러 `XxxController` · 서비스 `XxxService` · 리포지터리 `XxxRepository` · DTO 묶음 `XxxDtos`
- DB 컬럼은 snake_case, 자바 프로퍼티는 camelCase (`mybatis.configuration.map-underscore-to-camel-case: true`가 매핑)

### DI·컨트롤러 패턴
- **생성자 주입만** 쓴다. `@Autowired` 필드 주입 금지. 필드는 `private final`.
- 컨트롤러는 얇게: 검증 애너테이션(`@Valid`) → 서비스 호출 → DTO 반환이 기본. 사용자 식별은 `CurrentUser.id()`.
- 성공 상태 코드는 컨트롤러가 정한다. 자세한 규칙은 [backend.md](./02_architecture/backend.md) 「API 설계 원칙」이 정본이다.
- 소유권 검증은 **애플리케이션 코드가** 한다(DB RLS 없음). `findByIdAndUser(...)` 형태로 조회 단계에서 막는다.

### 예외·에러
- 도메인 예외는 `ApiExceptions`의 `BadRequestException` / `NotFoundException` 등을 던지고,
  오류 HTTP 매핑은 `GlobalExceptionHandler`가 한다. 컨트롤러에서 **오류** 상태 코드를 직접 만들지 않는다
  (미인증 401 은 예외 — `SecurityConfig` 의 `authenticationEntryPoint` 가 직접 낸다).
  성공 상태와 본문 형태는 위 「DI·컨트롤러 패턴」의 포인터를 따른다.

### 스키마
- **스키마의 소유자는 Flyway 마이그레이션 SQL**이다. 앱 코드가 `alter`하지 않는다.
- 새 변경은 `V{n}__설명.sql` 파일을 추가한다. 기존 마이그레이션을 수정하지 않는다.

### 설정
- 설정값은 `application.yml`에 `${ENV:기본값}` 형태로 두고, 코드에서는 `@Value("${app.…}")`로 읽는다.
- 기본값을 두면 위험한 값(`app.mode`, `app.jwt.secret`)은 **일부러 기본값을 비워** 기동에 실패하게 한다.

## 프론트엔드 (React · TypeScript)

### 포맷
- **스페이스 2칸** · **세미콜론 없음** · **작은따옴표** · 트레일링 콤마 사용
- lint는 `oxlint` (`frontend/.oxlintrc.json`)

### 폴더 구조
`frontend/src/` 아래 폴더 표는 [frontend.md](./02_architecture/frontend.md) 「폴더 구조」가 정본이다.
**새 파일은 그 표의 자리에 넣고, 표에 없는 최상위 폴더를 새로 만들지 않는다.**

### 컴포넌트 패턴
- 함수형 컴포넌트 + `export default function Xxx()`. 파일명 PascalCase(`ConfirmModal.tsx`).
- Props는 파일 안에 `interface XxxProps`로 선언한다.
- 유틸·훅 파일은 camelCase(`useChat.ts`), 상수는 UPPER_SNAKE_CASE(`STAGE_MIN_MS`).

### 상태관리
- **외부 상태 라이브러리를 쓰지 않는다.** 전역은 Context(`auth/AuthContext.tsx`, `theme/ThemeContext.tsx`),
  화면 상태는 도메인 훅(`hooks/useChat.ts`)이 `useState`/`useRef`로 보유한다.
- 서버 캐시 라이브러리(react-query 등)도 없다. 필요한 시점에 직접 호출하고 로컬 상태를 갱신한다.

### API 통신
- 컴포넌트가 `fetch`를 직접 부르지 않는다. `lib/api.ts`의 `api.get/post/patch/del/postForm`을 통해서만 호출한다.
- 엔드포인트는 `lib/endpoints.ts`에 **한 줄짜리 함수**로 노출한다.
- 실패는 `ApiError(status, message)`로 통일. 서버 응답 본문의 `message`를 그대로 사용자에게 보여준다.
- 채팅 스트림은 `EventSource`가 아니라 **fetch + ReadableStream** 이다. `EventSource`는 Authorization 헤더를 못 싣는다.

### 스타일
- Tailwind CSS 4 유틸리티 클래스. 별도 CSS 모듈·CSS-in-JS 없음. 전역은 `frontend/src/index.css`뿐.
- 다크 모드는 `html[data-theme="dark"]` 기준의 커스텀 variant다. `prefers-color-scheme`를 직접 참조하지 않는다 —
  시스템 설정 해석은 `ThemeProvider`가 단독으로 한다.
- **색은 토큰(`bg-surface` · `text-ink` · `bg-accent` …)으로만 쓴다.** 토큰이 테마별 값을 이미 들고 있으므로
  색에 `dark:` 를 붙이지 않는다. 새 색이 필요하면 유틸리티에 값을 박지 말고 `index.css` 에 토큰을 먼저 추가한다.
- 모션은 `ease-[var(--ease-out-quint)]` 하나로 통일한다. `transition` 기본 이징(`ease-in-out`)을 그대로 쓰지 않는다.

### 테스트
- 테스트는 **소스 옆에** 둔다(`useChat.test.ts`, `LoginPage.test.tsx`). 별도 `__tests__` 폴더를 만들지 않는다.
- Vitest + Testing Library. 실행 `npm test`.

## 테스트·CI 게이트

- 백엔드 통합 테스트는 Testcontainers로 **실 PostgreSQL**을 띄운다(`AbstractPgIntegrationTest`). H2 대체 금지.
- **실행 시각·시계 해상도에 따라 결과가 갈리는 검사를 두지 않는다.** 게이트가 되지 못하고, 어느 날 갑자기
  빨간불이 된다. 실제로 두 건이 이렇게 샜다 :
  - 레이트리밋은 **고정 윈도우**라 분 경계에서 카운터가 리셋된다. 상한 검사는 **상한의 두 배 넘게** 보내
    경계를 한 번 넘어도 한쪽 창에 초과분이 쌓이게 하거나, 429가 관측될 때까지 반복한다.
  - 두 시각을 비교할 때 한쪽 기준으로 등호를 걸지 않는다. 호출 전후로 재서 **구간 안**인지만 본다
    (시계 해상도가 거친 OS 에서는 우연히 통과하고 높은 OS 에서는 늘 실패한다).
- `scripts/case-floors.env`의 케이스 수 하한(래칫)은 **테스트를 늘린 PR 에서 그 시점 실측값으로 함께 올린다.**
  올리지 않으면 새로 넣은 케이스가 래칫의 보호를 못 받는다. 내릴 때는 무엇이 줄었는지 `docs/06_changelog/CHANGELOG.md` 에 남긴다.
- `scripts/check-doc-refs.sh`가 `docs/`·`README.md`의 참조 실재를 검사한다. **없는 파일 경로를 문서에 적으면 CI가 실패한다.**
- `scripts/check-runtime-versions.sh`가 `.nvmrc`·`backend/pom.xml`의 런타임 버전과 CI 설정이 갈리지 않는지 대조한다.
  node 쪽은 `frontend/package.json`의 `engines.node` 까지 같이 본다 — **Vercel 은 `.nvmrc` 가 아니라 `engines.node` 로 빌드하므로**,
  이것을 빼면 `.nvmrc` 만 올리고 `engines.node` 를 빠뜨려도 CI 는 통과하고 배포만 조용히 다른 런타임을 쓴다(실제로 있었던 일이다).
- 시크릿 스캔(gitleaks)·의존성 취약점 스캔(Trivy · `npm audit`)이 CI에 상시 물려 있다.

## Git 커밋 메시지

형식 : `type(scope): 한국어 설명 (#PR번호)`

- type : `feat` · `fix` · `refactor` · `style` · `docs` · `test` · `chore`
- scope는 선택 (`feat(chat): …`)
- 예 : `feat(chat): 동시 스트림 상한(back-pressure) (#13)`
