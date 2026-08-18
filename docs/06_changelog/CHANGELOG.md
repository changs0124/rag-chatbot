# Changelog

모든 주요 변경사항을 기록한다.

## [2026-08-18]

### Changed
- **Node.js 22 → 24 (Active LTS)** — `.nvmrc` · CI `setup-node` 2개 잡 · README 툴체인 표를 24 로 올림. Node 22 는 2025-10 부터 유지보수 LTS 라 보안 픽스만 들어옴
- 배포 런타임을 저장소에서 고정 — `frontend/package.json` 에 `engines.node: "24.x"` 추가. Vercel 프로젝트 설정은 이미 `24.x` 였는데 저장소는 22 를 선언하고 있어, CI 가 검증한 런타임과 실제로 배포 산출물을 만든 런타임이 갈려 있었음. Vercel 은 `engines.node` 를 대시보드 설정보다 우선하므로 이제 저장소가 배포 런타임의 단일 출처가 됨
- `scripts/check-runtime-versions.sh` 의 node 분기가 `.nvmrc` ↔ `engines.node` 메이저도 대조함. 종래에는 `.nvmrc` 와 CI 러너만 비교해서, `.nvmrc` 만 올리고 `engines.node` 를 빠뜨려도 CI 가 통과하고 배포만 조용히 다른 런타임을 쓰는 구멍이 남아 있었음

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
