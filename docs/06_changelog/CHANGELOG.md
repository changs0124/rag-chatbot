# Changelog

모든 주요 변경사항을 기록한다.

## [2026-08-18]

### Added
- **첨부 미리보기 — 입력창 썸네일 카드 · 확대 보기 · 드롭/붙여넣기(FEAT-CHAT-001~003)** — ChatGPT · Claude 채팅 입력창과 같은 동작으로 맞춤. 종래에는 고른 파일이 아이콘 + 파일명 칩으로만 보여 **보내기 전에는 어떤 사진인지 확인할 수 없었음**
  - 카드는 **파일명 없이 썸네일만** 둠(파일명은 `alt` · `aria-label` 로만 남김)
  - **업로드 시점을 전송 → 선택 즉시로 옮김.** 백엔드 변경 없음 — `POST /api/files` 가 원래 `message_id=null` 로 저장하고 `DELETE /api/files/{id}` 와 고아 회수 크론이 이미 이 모델을 전제로 있었음. 업로드 책임이 `useChat` 에서 `Composer` 로 이동했고 `onSend` 가 `File[]` 대신 업로드가 끝난 첨부 목록을 받음
  - 올라가지 않은(업로드 중 · 실패) 첨부가 있으면 **보내기를 막음**. 막지 않으면 그 이미지가 빠진 채 나가는데 카드는 화면에 남아 있어 사용자는 갔다고 읽음
  - 카드 제거는 진행 중이면 `AbortController` 로 끊고 이미 올라갔으면 서버에서도 지움. 미리보기 objectURL 은 **카드 제거 · 전송 · 언마운트** 세 곳에서 회수함 — 눈으로 확인되지 않는 규칙이라 테스트가 회수 호출을 단언함
  - 확대 보기(`ImageLightbox`)는 전송 전 카드와 말풍선 썸네일이 **같은 컴포넌트**를 씀. 좌우 이동은 양 끝에서 순환하지 않고, 내려받기는 blob 으로 받아 저장함 — 백엔드가 다른 오리진이라 `<a download>` 는 브라우저가 무시하고 새 탭으로 엶
  - 드래그 오버레이는 진입/이탈을 세어 판정함. `dragleave` 만 보면 자식 요소를 지날 때마다 깜빡임
  - 확대 화면은 **핀치 줌**을 받음(1~4배 · 더블탭 1↔2배 · 확대 상태 끌기). 1배 아래로는 줄지 않고, 이미지를 넘기면 배율·위치를 초기화함 — 들고 가면 다음 장이 엉뚱한 곳에서 잘려 보임. 이미지에 `touch-action: none` 이 없으면 브라우저 기본 제스처가 먼저 먹어 핀치 이벤트가 오지 않음
  - **문서 첨부 경로를 화면에서 제거** — `+` 메뉴가 사진 · 카메라 둘로 줄고, 드롭·붙여넣기로 들어온 비이미지는 버림. 2026-07-28 에 서버가 문서를 받지 않게 해 두고도 화면에는 "파일" 메뉴와 아이콘 카드가 남아 있어, 받지 않는 것을 고를 수 있는 경로가 남아 있었음. 과거 메시지에 남은 문서 첨부 표시는 그대로 둠(데이터가 존재할 수 있음)
  - **지운 카드의 업로드가 뒤늦게 성공하면 그 파일을 서버에서 지움** — 중단은 요청을 끊을 뿐 서버가 이미 받은 것을 되돌리지 않아, 지우지 않으면 회수 크론(기본 60분)을 기다리는 고아가 됨. 눈에 보이지 않는 경합이라 테스트로 잠금
  - 확대 화면에서 포인터 캡처를 잡음 — 확대 상태로 끌 때 손가락이 이미지 밖으로 나가면 이동이 멈추던 것
  - `frontend/src/test/setup.ts` 에 `PointerEvent` 폴리필 추가 — jsdom 에 없어서 핀치 검사가 밋밋한 `Event` 를 받고 "아무 일도 안 일어남"을 통과로 읽었음(실제로 그렇게 한 번 초록불이 났음)
  - 프론트 테스트 32 → 52 케이스(`FRONTEND_MIN` 동반 상향). 설계 문서는 `docs/99_inbox/features.md` · `docs/99_inbox/wireframe.md` · `docs/99_inbox/scenarios.md`

### Changed
- **전 화면 재디자인 — Claude 계열 웜 톤 + 채팅 앱 구조** — 채팅 · 로그인 · 마이페이지를 한 번에 다시 칠함. 배치는 ChatGPT · Claude 를 따랐고, 색은 웜 크림 계열로 바꿈(회색 계열은 대화가 길어지는 화면에서 눈이 빨리 지침)
  - **색을 토큰으로 접음** — 값은 `index.css` 의 `:root` · `[data-theme="dark"]` 에 CSS 변수로 두고 `@theme inline` 이 그것을 가리킴. 화면 코드는 `bg-surface` 한 번이면 두 테마가 다 되고, **색에는 `dark:` 를 쓰지 않음**. 종래 `bg-white dark:bg-zinc-950` 짝은 한쪽만 고쳐져 테마가 갈릴 수 있는 형태였음. 화면 코드에 남은 `zinc-*` 은 0건
  - **답변에서 말풍선을 걷어냄** — 두 제품 모두 답변에 색면을 깔지 않음. 긴 답변에 큰 색면이 깔리면 읽는 흐름이 끊김. 사용자 메시지만 카드로 남김
  - 입력창은 떠 있는 판(둥근 모서리 · 확산 그림자 · 포커스 시 accent 링), 메시지 하단에 스크롤 페이드
  - 사이드바는 대화를 **오늘 / 지난 7일 / 이전** 으로 묶음. 제목만 늘어놓으면 "어제 그 대화"를 눈으로 못 찾음
  - 모션은 이징 하나(`--ease-out-quint`)로 통일하고 `prefers-reduced-motion` 을 전역에서 존중함
  - 본문 서체 Pretendard 를 **번들에 넣음**(동적 서브셋). CDN 을 새로 물리지 않음. 한국어 `word-break: keep-all` 전역 적용
  - 모바일 : 높이를 `100dvh` 로(iOS 주소창이 접힐 때 입력창이 밀려나던 것), 입력창에 safe-area 여백, 드로어에 backdrop-blur + 뒤 화면 스크롤 잠금, 터치 대상 44px 확보
  - 화면 문구 2건이 바뀌어 그 단언도 함께 고침(빈 화면 인사 · 로그인 부제)
  - 카메라 모달 · 오류 경계 화면도 토큰으로 옮김 — 이 둘이 남아 있으면 테마를 바꿔도 두 화면만 예전 회색으로 튀어 보임
  - 파비콘 교체 — 말풍선 + 문서 + 출처 링크 모티프(생성 원본 `frontend/public/favicon-source.png`), `favicon.ico`(16·32·48) · `favicon-32.png` · `apple-touch-icon.png` 로 파생. 종전 Vite 기본 아이콘(`favicon.svg`) 제거
  - `frontend/index.html` 의 `lang` 을 `en` → `ko` 로 고침(문서는 한국어인데 영어로 선언돼 있어 스크린 리더가 잘못 읽음) + `theme-color` 를 테마별 `canvas` 값으로 지정
  - 설계 문서 : `docs/99_inbox/design-system.md` · `docs/99_inbox/redesign-wireframe.md`
- **사이드바 폭 조절(FEAT-UI-001)** — 데스크톱에서 경계를 끌어 200~420px 사이로 조절하고 `localStorage` 에 기억함. 끄는 동안에는 트랜지션을 걸지 않음(매 프레임 값이 바뀌는데 트랜지션이 있으면 손보다 늦게 따라와 고무줄처럼 보임)과 `user-select: none`(안 걸면 화면 글자가 선택돼 파랗게 반전됨)이 요점. 범위 밖 저장값은 무시하고 기본값으로 엶. 손잡이는 `role="separator"` 로 화살표 키에서도 동작함 — 마우스가 없으면 못 쓰는 기능을 만들지 않기 위함. 모바일 드로어에는 손잡이가 없음. 프론트 테스트 52 → 58
- **진행 단계 문구가 참조한 자료명을 밝힘(R-11)** — 목업의 조회 단계 라벨이 `목업 코퍼스 조회 중` 에서 `목업 코퍼스 조회 중 - 이용 정책 문서 · FAQ 문서` 로 바뀜. 자료명은 화면 하단 출처 목록과 **같은 값**(`CitationData.sourceName`)에서 파생시켜, 진행 문구가 말한 자료와 실제로 붙는 출처가 어긋날 수 없게 함. 무자료 분기는 붙일 자료명이 없으므로 종전 문구 그대로임(P-10)
  - `stageLabel(Stage)` → `stageLabel(Stage, List<String> sources)`, `Consumer<Stage>` → `BiConsumer<Stage, List<String>>`. 라벨 소유권은 그대로 구현에 있음(P-2) - `ChatService` 는 구현이 준 자료명을 넘기기만 함
  - 목업의 조회 단계 발행을 키워드 매칭 **뒤로** 옮김. 조회 결과가 정해져야 라벨에 자료명을 실을 수 있기 때문임
  - 라이브는 동작이 그대로임 - `file_search` 시작 이벤트 시점에는 어느 문서가 걸렸는지 아직 모르고 파일명은 `response.completed` 에서야 나오는데, 그때는 이미 토큰이 나간 뒤라 단계 라벨에 실을 수 없음(R-11 전송 규칙). 없는 이름을 지어내지 않고 비워 둠
  - 프론트는 변경 없음 - `label` 문자열을 그대로 렌더하므로
- **Node.js 22 → 24 (Active LTS)** — `.nvmrc` · CI `setup-node` 2개 잡 · README 툴체인 표를 24 로 올림. Node 22 는 2025-10 부터 유지보수 LTS 라 보안 픽스만 들어옴
- 배포 런타임을 저장소에서 고정 — `frontend/package.json` 에 `engines.node: "24.x"` 추가. Vercel 프로젝트 설정은 이미 `24.x` 였는데 저장소는 22 를 선언하고 있어, CI 가 검증한 런타임과 실제로 배포 산출물을 만든 런타임이 갈려 있었음. Vercel 은 `engines.node` 를 대시보드 설정보다 우선하므로 이제 저장소가 배포 런타임의 단일 출처가 됨
- `scripts/check-runtime-versions.sh` 의 node 분기가 `.nvmrc` ↔ `engines.node` 메이저도 대조함. 종래에는 `.nvmrc` 와 CI 러너만 비교해서, `.nvmrc` 만 올리고 `engines.node` 를 빠뜨려도 CI 가 통과하고 배포만 조용히 다른 런타임을 쓰는 구멍이 남아 있었음

### Security
- `nanoid` 3.3.16 → 3.3.18(high, GHSA-2v37-7h3g-55p8) · `postcss` 8.5.22 → 8.5.26(moderate, GHSA-fxqj-rqcc-2cmp). 코드 변경으로 들어온 것이 아니라, lockfile 동결(2026-07-28) 뒤에 advisory 가 공개되면서 `npm audit` 게이트가 빨간불이 된 것임 — nanoid advisory 공개일이 2026-07-29 로 동결일보다 하루 늦음. 둘 다 `vite`(devDependency) 경유라 배포 번들에는 들어가지 않고, 패치 범위에서 해결돼 빌드 산출물 해시가 바뀌지 않음

## [2026-07-29]

### Added
- **대화 이력 전송(멀티턴)** — 같은 대화의 이전 턴을 함께 보냄. 토큰 예산(`app.chat.history-token-budget`, 기본 6000) 안에서 최신부터 채우고, 과거 이미지는 재전송 대신 `(이미지 첨부)` 자리표시자로 대체. `status=error` 제외 · `stopped=true` 포함
- 배포 산출물 — `backend/Dockerfile`(호스트 무관 컨테이너, `PORT` 대응, 업로드 볼륨) · `frontend/vercel.json`(SPA 리라이트)
- 토큰 만료 전역 처리 — 401 이면 세션을 비우고 로그인으로 복귀. 단 로그인·회원가입·비밀번호 변경의 401 은 자격 증명 오류이므로 세션 유지
- 배포 빌드에서 `VITE_API_BASE_URL` 누락 시 콘솔 경고

### Fixed
- 시각 의존 테스트 3건 — CI(Linux)에서 드러남
  - `OrphanCleanupSchedulerTest` 가 두 `now()` 가 나노초까지 같을 때만 통과하는 단언을 씀. Windows 는 시계 해상도가 거칠어 우연히 통과했음
  - `ChatFlowTest`·`AuthFlowTest` 의 레이트리밋 검사가 분 경계에 걸치면 카운터 리셋으로 429가 나지 않았음(고정 윈도우). 상한의 두 배 넘게 보내도록 수정
- 통합 테스트가 고아 회수 크론을 끄지 않아 매시 정각에 실제로 발화하던 문제 — `app.file.orphan-cleanup-cron=-`. 스케줄러는 `OrphanCleanupSchedulerTest` 로 결정적 검증
- 쓰지 않는 `UserDetailsServiceAutoConfiguration` 을 제외 — 운영 로그에 "Using generated security password" 가 남던 것을 없앰
- `README.md` 의 무자료 표기 설명이 코드와 어긋나 있던 것(텍스트 접두 → 출처 0건 파생 표시)
- `backend/.env.example` 에 `ALLOWED_ORIGINS` 가 없고 DB 설정이 주석 처리돼 있어, 그대로 배포하면 CORS 로 전 API 가 차단되던 문제
- OpenAI 리소스 삭제(`deleteResources`)가 `app.openai.base-url` 설정을 무시하고 항상 실 API 로 나가던 문제 — 절대 URL 을 상대 경로로 교체. 회귀 테스트 `OpenAiRealDeleteResourcesTest` 추가

### Changed
- 메시지 재조회의 출처 질의를 메시지별 N회 → 대화당 1회로 변경(`CitationMapper.findByMessage` → `findByConversation`). 메시지 4건 대화에서 4회 → 1회 실측
- `ProfileService.updateName` · `updateTheme` 의 불필요한 선행 조회 제거(갱신 후 1회만 읽음)
- 케이스 수 하한 `BACKEND_MIN` 83 → 86(실측). 하한을 올리는 조건이 삭제된 계획 문서에 매여 있던 것을 "테스트를 늘린 PR 에서 함께 올림"으로 바꿈
- `docs/` 구조를 AI 협업용 스캐폴딩으로 재구성. 코드베이스 스캔 결과로 `INDEX.md` · `CONVENTIONS.md` · `02_architecture/overview.md` · `FEEDBACK.md` 생성

### Removed
- 이전 진행 문서 5종(계획 · 기술선택 · 운영 · PR로그 · 런칭)
- 계획서 필수 표 검사 스크립트(scripts/check-plan-tables.sh) 및 CI 의 해당 잡 스텝 — 검사 대상 문서가 사라짐
- 아무도 읽지 않던 `OpenAiMockService.streamChatCalls` 카운터
- `Composer` 의 동일한 숨은 file input 2개 중 1개 — 문서 업로드 폐지로 "파일"·"사진"이 같은 코드가 됐음
