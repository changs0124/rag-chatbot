## 작업 리포트 — 문서의 사본 · 낡은 경위를 정본 + 포인터로 정리

브랜치 `docs/508-docs-dedupe` · 커밋 `0ab24f9` · 문서 11개 · +38 / −75 · **사실은 바꾸지 않음**(코드 · 스크립트 변경 없음)

| 갈래 | 고친 내용 |
|---|---|
| 기본값 사본 7곳 | `overview.md`(9분 · 10분 · 30×10MB) · `backend.md`(10분 · 6000) · `api.md`(10분 · 60분) · `current-sprint.md`(6000) → env 이름(`OPENAI_STREAM_READ_TIMEOUT_MS` · `SSE_TIMEOUT_MS` · `RATELIMIT_UPLOAD_PER_MINUTE` · `CHAT_HISTORY_TOKEN_BUDGET` · `ORPHAN_TTL_MINUTES`) |
| 없는 포인터 | `overview.md` 「(값은 위 「외부 연동」)」 → 정본이 적힌 「운영 파라미터」 |
| 같은 규칙 여러 곳 | 로그 회전 10MB×3 → `backend.md` 하드닝 표 한 곳 · `SPRING_PROFILES_ACTIVE=` → `backend.md` 「실행 모드」(README · live-integration 은 포인터) · 상태관리 → `frontend.md` · 테스트 배치 → `CONVENTIONS` 「테스트」 · Testcontainers 근거 → `backend.md` 「테스트」 · 4.1 OSS 기한 → backlog |
| README | `.env.example` 을 다시 적던 env 표 삭제(CORS 5173 은 아래 한 번만) · 운영 URL 「데모」→「운영」 |
| INDEX | 빈 `03_references` · `05_issues` 행 삭제(「비어 있는 자리」 줄이 이미 설명) · 저장소에 없는 `CLAUDE.md` 참조 → **행동 지침 네 줄을 직접**(착수 때 결정) |
| 낡은 경위 | `backend.md` 「데모 - 로컬 + 터널」 절차 · 「배포」 두 갈래 서두 · `frontend.md` 터널 데모 문단 삭제(10-06 부터 운영, 스스로 미검증이라 적던 절차) · GCP 시절 표현 · 증거 경로 · `requirements.md` ID 승계 경위 · `current-sprint.md` 끝난 이슈 목록 → CHANGELOG 포인터 |
| CHANGELOG 머리 | `[Unreleased]` 는 다음 백엔드 운영 배포 전까지의 merge 를 모으고 프론트만 바뀐 항목도 둔다는 규칙 · #501 항목에 프론트 하한 282 → 283(`6651ae4` 의 `case-floors.env`) |

과거 CHANGELOG 구획 본문은 건드리지 않았다.

### 검증
`bash scripts/check-all.sh docs` — 문서 참조(297건 수집 · 283건 실재) · 섹션 이름(58건) 통과, 응답 계약 4곳 일치. shellcheck 는 로컬에 없어 건너뜀(셸 변경 없음, CI 가 돌린다)

### 증거
- before : 고치기 전 해당 구간 원문 [before/targets.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/508/evidence/before/targets.txt)
- after : [after/diff.patch](https://github.com/changs0124/rag-chatbot/blob/main/.issue/508/evidence/after/diff.patch) · [after/checks.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/508/evidence/after/checks.txt)
