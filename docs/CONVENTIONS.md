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
- 성공 상태는 컨트롤러가 정한다 — 삭제류는 `ResponseEntity<Void>` + `noContent()`(204),
  `@ResponseStatus(CREATED)`(201) 는 둘(문서 업로드 · 계정 발급), 그 외는 200. 성공 상태·본문 형태의 자세한 규칙은
  [backend.md](./02_architecture/backend.md) 「API 설계 원칙」이 정본이다.
- 소유권 검증은 **애플리케이션 코드가** 한다(DB RLS 없음). `findByIdAndUser(...)` 형태로 조회 단계에서 막는다.

### 예외·에러
- 도메인 예외는 `ApiExceptions`의 `BadRequestException` / `NotFoundException` 등을 던지고,
  오류 HTTP 매핑은 `GlobalExceptionHandler`가 한다 — 서블릿 필터 단계에서 나가는 오류(예: 미인증 401 ·
  CORS 403)는 이 경로를 거치지 않으며 `ApiError` 본문이 아니다. 컨트롤러에서 **오류** 상태 코드를
  직접 만들지 않는다.

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
- API 호출은 `lib/api.ts`의 `api.get/post/patch/del/postForm`을 통한다. **래퍼 밖에서 `fetch`를 직접
  부르는 곳은 둘** — 채팅 스트림(아래, `endpoints.ts`)과 첨부 저장(`ImageLightbox.download()`이 blob으로 받아야 해서). 앞의 것은 컴포넌트가 아니라 `lib/`에 있다.
- 엔드포인트 함수는 `lib/endpoints.ts`에 둔다. **대부분은 `api.*`를 한 줄로 감싼 것**이고, 래퍼로 안 되는 것만 함수로 편다 — 멀티파트 업로드 둘(`uploadFile`·`uploadDocument`)과 채팅 스트림이다. **`AuthContext`는 예외로 `/api/auth/me`와 `/api/auth/login`을 직접 부른다.**
- **응답이 도착한** 실패는 `ApiError(status, message)`로 통일. 서버가 `message`를 주면 그대로 보여주고, 없으면 `요청 실패 (n)`로 떨어진다. 네트워크 단계 실패(CORS 거절·오프라인·중단)는 `fetch` 또는 본문 읽기가 reject 되어 이 경로를 타지 않는다.
- 채팅 스트림은 `EventSource`가 아니라 **fetch + ReadableStream** 이다. `EventSource`는 Authorization 헤더를 못 싣는다.

### 스타일
- Tailwind CSS 4 유틸리티 클래스. 별도 CSS 모듈·CSS-in-JS 없음. 전역은 `frontend/src/index.css`뿐.
- 다크 모드는 `html[data-theme="dark"]` 기준의 커스텀 variant다. `prefers-color-scheme`를 직접 참조하지 않는다 —
  시스템 설정 해석은 `ThemeProvider`가 단독으로 한다.
- **색은 토큰(`bg-surface` · `text-ink` · `bg-accent` …)으로만 쓴다.** 토큰이 테마별 값을 이미 들고 있으므로
  색에 `dark:` 를 붙이지 않는다. 새 색이 필요하면 유틸리티에 값을 박지 말고 `index.css` 에 토큰을 먼저 추가한다.
- **색 리터럴이 허용되는 자리는 아래 셋뿐이다.** 나머지는 전부 토큰이다.
  - `frontend/src/components/Logo.tsx` · `frontend/public/favicon.svg` — **회사 CI 색.**
    토큰은 `data-theme` 으로 뒤집히는데 로고는 양 테마에서 고정이어야 한다. 토큰으로 빼면 다크에서
    로고가 다른 회사 색이 된다
  - `frontend/index.html` 의 `theme-color` — `<meta>` 는 CSS 변수를 못 읽는다. `canvas` 와 같은 값을 손으로 맞춘다
  - 아래가 **토큰이 아닌 면** 위에 얹히는 곳 — 사진·영상 위 오버레이(`ImageLightbox` · `CameraCapture` ·
    `Composer` 썸네일). 아래 면이 테마와 무관하므로 토큰이 성립하지 않는다
  자리를 늘리려면 [design-system.md](./02_architecture/design-system.md) 「색 값을 들고 있는 파일 — 넷이다」를 함께 고친다.
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
- 그 하한을 집행하는 것이 `scripts/check-case-floor.sh` 다 — **실측 케이스 수가 하한 미만이면 실패한다.**
  테스트 명령은 케이스가 삭제돼도 통과하므로 수를 따로 잰다. 위 항목이 "언제 올리고 내리는가"(사람이
  지킬 규칙)라면, 이쪽은 "무엇을 검사하는가"(게이트의 동작)다.
  **못 잡는 것** : 케이스의 **내용**. 수만 세므로 단언을 지우고 빈 테스트를 남겨도 통과한다.
  그리고 **측정 입력이 낡으면 조용히 속는다** — 백엔드는 `target/` 에 지운 클래스의 surefire XML 이
  남아 계수되므로 **`clean` 후 재야 하고**(2026-07-28 에 실제로 6건 부풀려졌다), 프론트는 이 스크립트가
  `vitest-report.json` 을 **읽기만 하고 만들지 않으므로** 리포트를 먼저 다시 만들어야 한다.
  `check-all.sh` 는 두 함정을 다 피해서 부른다.
- `scripts/check-shell-syntax.sh` 가 **추적되는 셸 전부**(`git ls-files '*.sh'` + `case-floors.env`)에
  `bash -n` 을 돌린다(#136). 종전에는 셸을 보는 게이트가 아예 없어, 게이트를 만드는 `check-*.sh`
  들이 정작 아무 게이트도 받지 않았다. **목록은 손으로 관리하지 않는다** — 새 스크립트가 저절로
  포함되고, 스크립트가 **검사한 개수를 출력해** 대상이 0이 되어도 "통과"로 보이지 않는다.
  `check-all.sh` 와 CI `static` 잡 **양쪽에서 제일 먼저** 돈다 — 아래 검사들이 전부 셸이라,
  하나가 깨지면 그 검사만 죽고 나머지는 통과해 부분적인 초록불이 나오기 때문이다.
  **못 잡는 것** : 의미 오류. 그쪽은 아래 정적 분석이 본다.
- `scripts/check-shell-lint.sh` 가 같은 대상에 **`shellcheck -x`** 를 돌린다(#145).
  `#138` 의 버그(`printf` 가 인자를 버리던 것)는 `bash -n` 을 통과했고 **shellcheck 만 SC2182
  로 잡았다** — 둘은 서로 다른 것을 잡으므로 스크립트도 나눠 두었다(실패 신호가 섞이지 않게).
  **경고를 남긴 채 통과시키지 않는다** — 도입 시점에 기존 12건을 전부 처리했다(고침 2 ·
  근거 있는 억제 6 · `-x` 로 해소 1 · 배열 전환으로 소멸 3). 하한을 두면 그 아래가 조용히 쌓인다.
  **억제는 반드시 이유와 함께** 쓴다(`# shellcheck disable=SCxxxx` 바로 위에 한국어 한 줄).
  `ubuntu-latest` 러너에는 기본 설치돼 있고, 로컬에 없으면 **"통과"가 아니라 "모름"** 으로 찍힌다.
- `scripts/check-doc-refs.sh`가 `docs/`·`README.md`의 참조 실재를 검사한다. **없는 파일 경로를 문서에 적으면 CI가 실패한다.**
- `scripts/check-doc-sections.sh` 가 **섹션 이름**을 본다(#60). 위 검사는 파일이 있으면 통과하므로 없는 섹션을
  가리켜도 초록이었다 — #28 에서 실제로 그렇게 통과했다. **파일 참조가 바로 앞에 붙은** 「섹션」만 검사하고,
  헤딩의 번호 접두(`## 2. API 목록`)와 접미(`## 배포 (Vercel)`)를 견딘다.
  **못 잡는 것** : 같은 문서 안 참조(대상 파일이 없다) · 별명으로 부르는 것("백로그 「…」") ·
  섹션이 아닌 강조(「자료 없음」은 UI 배너 이름) · `docs/06_changelog/**`.
- `scripts/check-runtime-versions.sh`가 `.nvmrc`·`backend/pom.xml`의 런타임 버전과 CI 설정이 갈리지 않는지 대조한다.
  node 쪽은 `frontend/package.json`의 `engines.node` 까지 같이 본다 — **Vercel 은 `.nvmrc` 가 아니라 `engines.node` 로 빌드하므로**,
  이것을 빼면 `.nvmrc` 만 올리고 `engines.node` 를 빠뜨려도 CI 는 통과하고 배포만 조용히 다른 런타임을 쓴다(실제로 있었던 일이다).
- `scripts/check-doc-versions.sh` 가 **문서가 주장하는 버전**(`INDEX.md` 기술 스택 표 · `backend.md` 머리줄 ·
  `overview.md` 등)을 `pom.xml` · `frontend/package.json` · Spring Boot BOM 의 실제 값과 대조한다.
  문서 값이 실제의 **접두**면 통과한다 — 문서는 메이저만 적기도 하기 때문이다(`React 19` ↔ `19.2.7`).
  **`backend` 잡에서 돈다** : JUnit 은 `pom.xml` 에 없고 Boot BOM 이 관리해서 `./mvnw verify` 로 m2 가
  채워진 뒤에만 읽을 수 있다. checkout 과 bash 뿐인 `docs` 잡에 붙였으면 정작 잡아야 할 것을 못 잡았다.
  **못 잡는 것** : 스크립트 안의 표에 없는 라이브러리, 이름 없이 숫자만 적힌 서술, `docs/06_changelog/**`(이력이라
  당시 값이 맞아 일부러 제외), 그리고 **버전이 아닌 목록형 서술**(CI 잡 목록·이 게이트 목록 자체가 그렇다).
- `scripts/check-response-contract.sh` 가 `AdminDtos.DocumentResponse` · `summaryResult` 의 `<arg>` · 프론트 `RagDocument` ·
  `AdminPage.test.tsx` 의 `doc()` 픽스처, **네 곳의 필드 이름**을 대조한다. record 와 `resultMap` 은 순서까지, 프론트 쪽은
  이름 집합만 본다 — MyBatis 는 위치로 생성자를 찾지만 TS 의 필드 순서는 런타임 의미가 없다.
  **픽스처를 따로 보는 이유** : 종전에는 `tsconfig.app.json` 이 테스트 파일을 exclude 하고 vitest 는 타입을 보지 않아
  픽스처가 **어느 게이트도 거치지 않았다.** #59 에서 exclude 를 걷어 이제 `tsc -b` 가 픽스처의 타입을 본다.
  **그래도 이 게이트를 지우지 않는다** — 타입 검사는 `RagDocument` 와 픽스처가 서로 맞는지만 보고,
  그 타입이 **백엔드 record · resultMap 과 맞는지**는 보지 못한다. 서로 다른 것을 잡는다.
  이름이 아니라 **값**이 제 컬럼에서 왔는지는 `AdminDocumentFlowTest` 가 본다. 이름만 보면 결선이 어긋나도 통과하고,
  값만 보면 프론트가 따로 놀아도 통과한다.
- 시크릿 스캔(gitleaks)·의존성 취약점 스캔(Trivy · `npm audit`)은 **변경마다 + 주 1회** 돈다(#135).
  한때 주 1회만 돌린 적이 있는데(#127) 근거는 "Actions 분이 유료 한도에
  묶인다" 였다. 2026-09-11 공개 전환으로 **그 근거가 사라졌다** — 공개 저장소는 분이 무료다.
  오히려 공개 저장소는 **시크릿이 한 번 들어오면 회수가 불가능**하므로 merge 전에 돌아야 한다.
  **주간 실행은 그대로 둔다** — 이 셋은 우리 커밋이 아니라 **바깥**(취약점 DB · 커밋 이력 전체)이
  바뀔 때도 결과가 달라져, 둘은 서로 다른 것을 잡는다.
- **`.issue/**` 만 바뀐 푸시는 CI 를 건너뛴다**(`paths-ignore`). 증거 미러 커밋은 코드가 한 줄도
  바뀌지 않는다. `pull_request` 에는 넣지 않았다 — 건너뛴 워크플로는 required checks 에서
  pending 으로 남아 merge 를 막는다.
- **푸시 전 예행은 `bash scripts/check-all.sh`** 다. CI 와 같은 스크립트를 로컬에서 돌린다.
  `docs`(문서만) · `quick`(무거운 빌드 제외) · 전체 세 모드가 있고 종료 코드가 실패한 검사 수다.
  gitleaks·Trivy 가 없으면 건너뛰되 **그 사실을 크게 찍는다** — 조용히 넘어가면 「통과」와
  「검사 안 함」이 구분되지 않는다.

## Git 커밋 메시지

형식 : `type(scope): 한국어 설명 (#PR번호)`

- type : `feat` · `fix` · `refactor` · `style` · `docs` · `test` · `chore`
- scope는 선택 (`feat(chat): …`)
- 예 : `feat(chat): 동시 스트림 상한(back-pressure) (#13)`
