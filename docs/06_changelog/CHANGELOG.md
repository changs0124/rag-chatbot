# Changelog

모든 주요 변경사항을 기록한다.

## [2026-08-18]

### Changed
- **진행 단계 문구가 참조한 자료명을 밝힘(R-11)** — 목업의 조회 단계 라벨이 `목업 코퍼스 조회 중` 에서 `목업 코퍼스 조회 중 - 이용 정책 문서 · FAQ 문서` 로 바뀜. 자료명은 화면 하단 출처 목록과 **같은 값**(`CitationData.sourceName`)에서 파생시켜, 진행 문구가 말한 자료와 실제로 붙는 출처가 어긋날 수 없게 함. 무자료 분기는 붙일 자료명이 없으므로 종전 문구 그대로임(P-10)
  - `stageLabel(Stage)` → `stageLabel(Stage, List<String> sources)`, `Consumer<Stage>` → `BiConsumer<Stage, List<String>>`. 라벨 소유권은 그대로 구현에 있음(P-2) - `ChatService` 는 구현이 준 자료명을 넘기기만 함
  - 목업의 조회 단계 발행을 키워드 매칭 **뒤로** 옮김. 조회 결과가 정해져야 라벨에 자료명을 실을 수 있기 때문임
  - 라이브는 동작이 그대로임 - `file_search` 시작 이벤트 시점에는 어느 문서가 걸렸는지 아직 모르고 파일명은 `response.completed` 에서야 나오는데, 그때는 이미 토큰이 나간 뒤라 단계 라벨에 실을 수 없음(R-11 전송 규칙). 없는 이름을 지어내지 않고 비워 둠
  - 프론트는 변경 없음 - `label` 문자열을 그대로 렌더하므로
- **Node.js 22 → 24 (Active LTS)** — `.nvmrc` · CI `setup-node` 2개 잡 · README 툴체인 표를 24 로 올림. Node 22 는 2025-10 부터 유지보수 LTS 라 보안 픽스만 들어옴
- 배포 런타임을 저장소에서 고정 — `frontend/package.json` 에 `engines.node: "24.x"` 추가. Vercel 프로젝트 설정은 이미 `24.x` 였는데 저장소는 22 를 선언하고 있어, CI 가 검증한 런타임과 실제로 배포 산출물을 만든 런타임이 갈려 있었음. Vercel 은 `engines.node` 를 대시보드 설정보다 우선하므로 이제 저장소가 배포 런타임의 단일 출처가 됨
- `scripts/check-runtime-versions.sh` 의 node 분기가 `.nvmrc` ↔ `engines.node` 메이저도 대조함. 종래에는 `.nvmrc` 와 CI 러너만 비교해서, `.nvmrc` 만 올리고 `engines.node` 를 빠뜨려도 CI 가 통과하고 배포만 조용히 다른 런타임을 쓰는 구멍이 남아 있었음
- **배포 문서를 두 갈래로 나눔(상시 공개 컨테이너 · 데모 로컬+터널)** — 종래 배포 절은 컨테이너 경로만 적어서, 프론트만 Vercel 에 올라가 있고 백엔드는 로컬인 현재 상태에서 무엇을 해야 하는지가 문서에 없었음. 터널 경로에서 실제로 사람이 틀리는 두 지점을 명시함 : `ALLOWED_ORIGINS` 에 터널 주소를 넣는 것(넣을 값은 화면의 출처인 Vercel 도메인임) · 터널 주소가 바뀌었을 때 Vercel 환경변수만 고치고 재배포를 빠뜨리는 것(`VITE_API_BASE_URL` 은 빌드 시점 치환이라 반영되지 않음). ngrok 무료 플랜의 interstitial 은 `CorsConfig` 허용 헤더 화이트리스트와 `<img src>` 첨부 경로 때문에 헤더 우회가 절반만 통한다는 점을 **미검증 항목으로** 함께 적음

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
