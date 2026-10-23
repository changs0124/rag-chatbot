# rag-chatbot

> OpenAI API(모델은 `OPENAI_MODEL` 기본값) + OpenAI 플랫폼 Vector Store 기반 RAG 챗봇. 답변에 출처를 항상 표기하고, 자료가 없으면 그 사실을 밝힌 뒤 추론한다.

모노레포 : `frontend/` (React + Vite) · `backend/` (Spring Boot + MyBatis) · `docs/` (이 폴더)

## 스택 · 실행 · 배포

- **스택 · 버전** : [README](../README.md) 「기술 스택」. CI 7잡과 주 1회 스케줄은 [CONVENTIONS](./CONVENTIONS.md) 「테스트·CI 게이트」
- **로컬 실행** : [README](../README.md) 「로컬 실행」. 환경변수 정본은 `.env.example` 셋, `APP_MODE` 가드는 [backend](./02_architecture/backend.md) 「실행 모드」
- **배포** : 2026-10-06 운영 시작. 절차는 [backend](./02_architecture/backend.md) 「배포」 · [frontend](./02_architecture/frontend.md) 「배포 (Vercel)」

## Docs 구조

1인 개발 + AI 협업 기준으로 **정본 하나만 남긴다.** 같은 사실을 두 곳에 적지 않는다.

| 문서 | 담는 것 |
|------|---------|
| [요구사항정의서](./01_specs/requirements.md) | `REQ-` ID 정본. AUTH · CHAT · RAG · ADMIN · OPS 다섯 카테고리 |
| [기능명세서](./01_specs/features.md) | `FEAT-` ID · 처리 흐름 · 예외 처리 · 범위 밖 |
| [ERD 설계서](./01_specs/erd.md) | 테이블 정의 · 인덱스 · 설계 원칙 · 사용량 조회 SQL |
| [API 명세서](./01_specs/api.md) | `API-` ID · 공통 규칙 · 에러 코드 |
| [OpenAI 실 연동 투입 절차](./01_specs/live-integration.md) | `mock` → `live` 전환 절차와 비용 발생 지점 |
| [Architecture](./02_architecture/overview.md) | 시스템 전체 구조 · API 맵 · 데이터 흐름 · 알려진 제약 |
| [Frontend](./02_architecture/frontend.md) | 라우팅 · 상태관리 · 스트리밍 UI · 첨부 UI 계약 |
| [Backend](./02_architecture/backend.md) | 레이어 · 인증 · SSE 계약 · 유량 제어 · 배포 |
| [디자인 시스템](./02_architecture/design-system.md) | 색 토큰 · 타이포 · 모션 · 컴포넌트 규칙 |
| [Conventions](./CONVENTIONS.md) | 코드 스타일 & 패턴 규칙 |
| [Feedback](./FEEDBACK.md) | 다건 수정 요청을 모아 한 번에 전달 · **지금 비어 있음** |
| [References](./03_references/) | 외부 레퍼런스(디자인 · API · 라이브러리) · **지금 비어 있음** |
| [Current Tasks](./04_tasks/current-sprint.md) | 현재 진행 중 작업 |
| [Backlog](./04_tasks/backlog.md) | 전체 태스크 |
| [Open Issues](./05_issues/open/) | 처리 중인 이슈(해결분은 `05_issues/resolved/`) · **지금 비어 있음** |
| [Changelog](./06_changelog/CHANGELOG.md) | 변경 이력 |

**정본 위치** — `REQ-` 는 요구사항정의서, `FEAT-` 는 기능명세서, `API-` 는 API 명세서,
테이블·컬럼은 ERD 가 정본이다. 기능이 늘면 새 파일을 만들지 않고 해당 문서에 병합한다.

**비어 있는 자리** : `지금 비어 있음` 표시 · `99_inbox/` · `02_architecture/diagrams/` · `04_tasks/completed/` 는 `project-docs` 골격용 `.gitkeep` 뿐이다.
쓸 것이 생기면 새 자리를 만들지 말고 여기에 넣는다. `99_inbox/` 는 `/project-docs-gen` 산출물 임시 보관함이라 검토해 `01_specs/` 로 옮기고 비운다.

**두지 않는 것** : 정보구조도 · 플로우차트 · 와이어프레임 · 시나리오 케이스 · 역할 매트릭스 ·
기술 스택 결정서. 1인 개발에서는 구현과 위 문서가 정본이라 별도 문서가 곧 낡은 사본이 된다.
각 문서의 판단 근거는 남겼다 — 호스트 선정 경위는 [CHANGELOG](./06_changelog/CHANGELOG.md) #243, 역할 설계는 `docs/02_architecture/backend.md` 「인증」,
리스크는 `docs/02_architecture/overview.md` 「알려진 제약」이다.

## AI 사용 가이드

이 프로젝트에서 AI와 협업할 때:
1. 먼저 이 `INDEX.md`를 읽어서 프로젝트 전체를 파악
2. `docs/CONVENTIONS.md`를 참고하여 코드 스타일 준수
3. `docs/FEEDBACK.md`에 대기 중인 수정 요청이 있으면 먼저 확인
4. 작업 후 "리뷰해줘"로 코드 리뷰 & 변경사항 기록

문서에 없는 파일 경로를 적으면 CI의 `scripts/check-doc-refs.sh`가 실패한다. 푸시 전에 `bash scripts/check-all.sh docs` 로 미리 확인할 수 있다.

루트 `CLAUDE.md`의 행동 지침(가정 금지 · 단순함 우선 · 외과적 변경 · 목표 기반 실행)이 위 규칙보다 우선한다.
