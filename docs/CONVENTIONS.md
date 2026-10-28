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
- 성공 상태는 컨트롤러가 정한다 — 어느 핸들러가 어떤 성공 상태를 내는지와 본문 형태의 규칙은
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
  **`@Value` 에는 기본값을 다시 적지 않는다**(`${app.…:기본값}` 금지) - 기본값이 두 곳이면 하나만 고쳐 갈린다(#300).
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
- **외부 상태 라이브러리 · 서버 캐시 라이브러리를 쓰지 않는다.** 누가 무엇을 보유하는지와 근거는
  [frontend.md](./02_architecture/frontend.md) 「상태관리」가 정본이다.

### API 통신
- API 호출은 `lib/api.ts` 의 `api.*` 래퍼를 통하고, 엔드포인트 함수는 `lib/endpoints.ts` 에 둔다. 래퍼 밖 `fetch` 예외 · `ApiError` · 채팅 스트림 규칙은
  [frontend.md](./02_architecture/frontend.md) 「API 통신」이 정본이다.

### 스타일
- Tailwind CSS 4 유틸리티 클래스. 별도 CSS 모듈·CSS-in-JS 없음. 전역은 `frontend/src/index.css`뿐.
- **시각 규칙(라이트 하나 · 색 토큰 · 모션)의 정본은 [design-system.md](./02_architecture/design-system.md) 다.** 코드에서 지킬 것 :
  `dark:` · `data-theme` · `prefers-color-scheme` 을 쓰지 않는다(`src/theme-tokens.test.ts` 가 막는다).
  색은 토큰 유틸리티(`bg-surface` · `text-ink` …)로만 쓰고, 새 색은 `index.css` 에 토큰을 먼저 추가한다.
  **색 리터럴은 design-system 「색 리터럴이 허용되는 자리」 표의 자리에서만** 쓴다 — 자리를 늘리려면 그 표를 함께 고친다.
- **이모지·장식 기호를 화면에 쓰지 않는다**(#192). 아이콘은 `components/icons.tsx` 의 라인 아이콘만 쓴다 — `src/no-emoji.test.ts` 가 막는다.
- 모션 이징은 `ease-[var(--ease-out-quint)]` 하나다. `transition` 기본 이징(`ease-in-out`)을 그대로 쓰지 않는다.

### 테스트
- 테스트는 **소스 옆에** 둔다(`useChat.test.ts`, `LoginPage.test.tsx`). 별도 `__tests__` 폴더를 만들지 않는다.
- Vitest + Testing Library. 실행 `npm test`.

## 테스트·CI 게이트

- 백엔드 통합 테스트는 Testcontainers로 **실 PostgreSQL**을 띄운다(`AbstractPgIntegrationTest`). H2 대체 금지 — 근거는 [backend.md](./02_architecture/backend.md) 「테스트」.
- **실행 시각·시계 해상도에 따라 결과가 갈리는 검사를 두지 않는다.** 게이트가 되지 못하고, 어느 날 갑자기
  빨간불이 된다. 실제로 두 건이 이렇게 샜다 :
  - 레이트리밋은 **고정 윈도우**라 분 경계에서 카운터가 리셋된다. 상한 검사는 **상한의 두 배 넘게** 보내
    경계를 한 번 넘어도 한쪽 창에 초과분이 쌓이게 하거나, 429가 관측될 때까지 반복한다.
  - 두 시각을 비교할 때 한쪽 기준으로 등호를 걸지 않는다. 호출 전후로 재서 **구간 안**인지만 본다
    (시계 해상도가 거친 OS 에서는 우연히 통과하고 높은 OS 에서는 늘 실패한다).
- 문서가 인용하는 `TC-<카테고리>-<번호>`(예 : TC-OPS-032)는 테스트 케이스 식별자다. 정의는 테스트 코드의 주석 · 이름에만 있으므로
  `grep -rn TC-OPS-032 backend/src/test frontend/src` 로 찾는다.
- 케이스 수 하한(래칫)을 올리고 내리는 규칙은 `scripts/case-floors.env` 머리 주석이 정본이다(테스트를 늘린 PR 에서 그 시점 실측값으로 함께 올린다).
- 아래 게이트마다 **무엇을 보는지**만 적는다. 무엇을 못 잡는지와 도입 경위는 각 스크립트 머리 주석과 CHANGELOG 가 정본이다.
- `scripts/check-case-floor.sh` 가 그 하한을 집행한다 — **실측 케이스 수가 하한 미만이면 실패한다**(수만 세므로 케이스의 내용은 못 본다).
  **측정 입력이 낡으면 조용히 속는다** — 백엔드는 지운 클래스의 surefire XML 이 `target/` 에 남으므로 **`clean` 후 재고**,
  프론트는 이 스크립트가 `vitest-report.json` 을 **읽기만 하므로** 리포트를 먼저 다시 만든다. `check-all.sh` 는 두 함정을 다 피해서 부른다.
- `scripts/check-shell-syntax.sh` 가 **추적되는 셸 전부**(`git ls-files '*.sh'` + `case-floors.env`)에 `bash -n` 을 돌린다(#136).
  목록은 손으로 관리하지 않고, 검사한 개수를 출력한다. `check-all.sh` 와 CI `static` 잡 **양쪽에서 제일 먼저** 돈다.
- `scripts/check-shell-lint.sh` 가 같은 대상에 **`shellcheck -x`** 를 돌린다(#145). **경고 0 을 유지한다.**
  억제는 이유 한 줄과 함께 쓴다(`# shellcheck disable=SCxxxx` 바로 위에 한국어 한 줄). 로컬에 없으면 **"통과"가 아니라 "모름"** 으로 찍힌다.
- `scripts/check-merge-markers.sh` 가 줄 맨 앞의 **병합 충돌 표시**(`<<<<<<< ` · `>>>>>>> ` · `||||||| `)를 추적 중인 파일과 추적 전 새 파일에서 찾는다(#210).
- `scripts/check-doc-refs.sh`가 `docs/`·`README.md`의 참조 실재를 검사한다. **없는 파일 경로를 문서에 적으면 CI가 실패한다.**
- `scripts/check-doc-sections.sh` 가 **파일 참조가 바로 앞에 붙은** 「섹션」 이름이 대상 파일 헤딩에 있는지 본다(#60).
- `scripts/check-runtime-versions.sh`가 `.nvmrc`·`backend/pom.xml`의 런타임 버전과 CI 러너에서 실제로 도는 런타임(`node --version` · `java -version`)이 같은지 대조한다.
  node 쪽은 `frontend/package.json` 의 `engines.node` 까지 본다 — **Vercel 은 `.nvmrc` 가 아니라 `engines.node` 로 빌드한다.**
- `scripts/check-doc-versions.sh` 가 **문서가 주장하는 버전**(README 「기술 스택」 표 · `backend.md` 머리줄 · `overview.md` 등)을
  `pom.xml` · `frontend/package.json` · Spring Boot BOM 의 실제 값과 대조한다(문서 값이 실제의 **접두**면 통과).
  JUnit 이 Boot BOM 에 있어 m2 가 채워진 뒤에야 읽히므로 **`backend` 잡에서 돈다.**
- `scripts/check-response-contract.sh` 가 `AdminDtos.DocumentResponse` · `summaryResult` 의 `<arg>` · 프론트 `RagDocument` ·
  `AdminDocumentsPage.test.tsx` 의 `doc()` 픽스처, **네 곳의 필드 이름**을 대조한다(record ↔ `resultMap` 은 순서까지).
  `tsc -b` 가 픽스처 타입을 봐도 **지우지 않는다** — 백엔드와의 대조는 이 게이트만 한다. 값의 출처는 `AdminDocumentFlowTest` 가 본다.
- 시크릿 스캔(gitleaks)·의존성 취약점 스캔(Trivy · `npm audit`)은 **변경마다 + 주 1회** 돈다(#135).
  공개 저장소는 **시크릿이 한 번 들어오면 회수가 불가능**하므로 merge 전에 돌아야 한다.
  주간 실행은 우리 커밋이 아니라 **바깥**(취약점 DB)이 바뀐 것을 잡는다.
- **CI 7잡 전부가 `main` 의 required status checks 다**(#166, `main: CI must pass` ruleset) — `backend` · `frontend` · `docker` ·
  `static` · `secrets` · `deps (백엔드)` · `deps (프론트)`. **이 목록은 축약이다**(#172) — 실제 context 는 `ci.yml` 잡 `name:` 전체 문자열이고,
  여기에 옮겨 적지 않는다. 무엇을 넣고 뺐는지의 이유는 CHANGELOG #166 이다(`secrets` · `deps` 가 필수인 근거는 위 #135).

  **`ci.yml` 의 `name:` 을 고치면 ruleset context 도 같이 고친다** — 하나만 바꾸면 체크가 영영 pending 이 되어 merge 가 막힌다.
  merge 가 체크에 막혔을 때(체크 pending · 체크 없음 · ruleset 복원 · 필수 목록 확인)의 절차는 아래 「CI 장애 대응」.
- **관리자 우회(`bypass_actors` = Repository admin / always)는 유지하고 strict(최신 `main` 위)는 끈다**(#166) — 이유는 CHANGELOG #166.
- **게이트는 API 응답이 아니라 일부러 깨뜨린 PR 의 merge 거부로 검증한다**(관리자 우회가 없는 임시 ruleset 에서. 방법은 CHANGELOG #166).
- **`.issue/**` 만 바뀐 푸시는 CI 를 건너뛴다**(`paths-ignore`). 증거 미러 커밋은 코드가 한 줄도
  바뀌지 않는다. `pull_request` 에는 넣지 않았다 — 건너뛴 워크플로는 required checks 에서
  pending 으로 남아 merge 를 막는다.
- **푸시 전 예행은 `bash scripts/check-all.sh`** 다. CI 와 같은 스크립트를 로컬에서 돌린다.
  `docs`(문서만) · `quick`(무거운 빌드 제외) · 전체 세 모드가 있고 종료 코드가 실패한 검사 수다.
  gitleaks·Trivy 가 없으면 건너뛰되 **그 사실을 크게 찍는다** — 조용히 넘어가면 「통과」와
  「검사 안 함」이 구분되지 않는다.

## CI 장애 대응

위 「테스트·CI 게이트」의 필수 체크가 merge 를 막을 때의 절차다. 규칙 자체는 그 절에 있다.

- **무엇이 필수인지 확인하거나 ruleset 을 복원해야 하면 문서를 보지 말고 정본에서 뽑는다.** 명령은 하나다.

  ```bash
  gh api repos/changs0124/rag-chatbot/rules/branches/main \
    --jq '[.[]|select(.type=="required_status_checks").parameters.required_status_checks[].context]'
  ```

  `--jq` 없이 부르면 레거시 branch protection 과 ruleset 을 **둘 다** 모아 보여준다. `branches/main` 의
  `.protection.required_status_checks.enforcement_level` 로는 **ruleset 이 안 보인다**(`off` 로 나온다) —
  그 명령으로 판단하면 걸려 있는데 없다고 읽는다. 규칙이 사라져 그것조차 못 읽는 상황이면 `ci.yml` 의 잡 `name:` 값을 그대로 쓴다.
- **체크가 「어긋난 것」과 「아예 없는 것」은 증상이 같고 고치는 법이 다르다**(#170).
  둘 다 merge 가 영구 차단된 모습으로 보이므로 먼저 어느 쪽인지 가린다.

  ```text
  체크가 이름만 다른 것이 붙어 pending   -> 위 「테스트·CI 게이트」의 name: 규칙. ci.yml 의 name: 과 ruleset context 를 맞춘다
  체크가 아예 붙지 않음                   -> run 자체가 안 생긴 것이다. 아래 절차
  ```

  **run 이 생겼는지 확인한다.** PR 화면은 「체크 없음」과 「run 없음」을 구분해 주지 않는다.

  ```bash
  gh api "repos/changs0124/rag-chatbot/actions/runs?branch=<브랜치>" \
    --jq '.workflow_runs[]|"\(.created_at) \(.event) \(.head_sha[0:8])"'
  ```

  PR head SHA 에 해당하는 `pull_request` 줄이 없으면 run 이 안 생긴 것이다(간헐적으로 재발한다 — 경위는 CHANGELOG #170).
  **복구는 PR 을 닫고 다시 여는 것이다** — `reopened` 는 `pull_request` 기본 트리거라 커밋 이력을 건드리지 않는다.

  ```bash
  gh pr close <n> && gh pr reopen <n>
  ```

  **`gh workflow run` 으로는 풀리지 않는다** — PR 의 required checks 는 `workflow_dispatch` 로 생긴 체크를 세지 않는다.

## Git 커밋 메시지

형식 : `type(scope): 한국어 설명 (#PR번호)`

- type : `feat` · `fix` · `refactor` · `style` · `docs` · `test` · `chore`
- scope는 선택 (`feat(chat): …`)
- 예 : `feat(chat): 동시 스트림 상한(back-pressure) (#13)`
