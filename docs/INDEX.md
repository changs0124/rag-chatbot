# rag-chatbot

> OpenAI API(GPT-4o) + OpenAI 플랫폼 Vector Store 기반 RAG 챗봇. 답변에 출처를 항상 표기하고, 자료가 없으면 그 사실을 밝힌 뒤 추론한다.

모노레포 : `frontend/` (React + Vite) · `backend/` (Spring Boot + MyBatis) · `docs/` (이 폴더)

## Tech Stack

| 영역 | 스택 |
|------|------|
| Frontend | React 19 · TypeScript 6 · Vite 8 · React Router 8 · Tailwind CSS 4 |
| Backend | Java 17 · Spring Boot 4.1.1 · Spring Security · MyBatis 4.1.0 · Maven Wrapper |
| Database | PostgreSQL (Flyway 마이그레이션, `backend/src/main/resources/db/migration/`) |
| 외부 연동 | OpenAI Chat(GPT-4o) + Vector Store — `APP_MODE=mock\|live`로 전환 |
| 저장소 | 로컬 디스크(`FILE_STORAGE_ROOT`) — `FileStorage` 인터페이스로 S3 교체 가능 |
| 테스트 | 백엔드 JUnit 6 + Testcontainers(실 PostgreSQL) · 프론트 Vitest + Testing Library |
| Lint | oxlint (프론트) |
| CI | GitHub Actions — **변경마다 7잡 전부**(backend · frontend · docker · static · secrets · deps ×2). secrets · deps 는 **주 1회 스케줄로도 한 번 더** 돈다 — 코드가 그대로여도 취약점 DB 가 바뀌면 답이 달라지기 때문이다(#135). 푸시 전 로컬 예행은 `bash scripts/check-all.sh` |

## 실행

```bash
# 백엔드 (backend/.env.example 참고 — APP_MODE, JWT_SECRET 필수)
cd backend && ./mvnw spring-boot:run     # http://localhost:8080

# 프론트 (frontend/.env.example 참고)
cd frontend && npm ci && npm run dev     # http://localhost:5173
```

`APP_MODE`는 기본값이 없다. 미설정이면 `AppModeGuard`가 기동을 막는다 — 목업이 우연히 켜지는 경로를 없애기 위한 의도적 설계다.

**`./mvnw` 로 띄울 때 `backend/.env` 는 읽히지 않는다.** dotenv 로더가 없어서 셸에 직접 넣어야 한다(`export $(grep -v '^#' backend/.env | xargs)`). `.env` 를 그대로 읽는 것은 `docker compose` 뿐이며, DB까지 함께 뜨므로 그쪽이 더 간단하다 — `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build db app`. **override 를 겹치는 이유**는 본체에 `build` 가 없기 때문이다 — 배포 서버가 1GB 급이라 서버에서 빌드할 수 없어 이미지를 로컬에서 빌드해 `scripts/deploy.sh` 가 서버로 옮긴다(#127). 절차는 [backend](./02_architecture/backend.md) 「배포」.

## 배포 준비 상태

코드는 **키·Vector Store·서버만 준비하면 도는 상태**로 맞춰져 있다.

| 준비물 | 상태 |
|--------|------|
| 프론트 배포 | `frontend/vercel.json` (SPA 리라이트 포함). 환경변수 `VITE_API_BASE_URL` 외에 **저장소 연결과 Root Directory 지정이 남아 있다** — 절차 정본은 [frontend](./02_architecture/frontend.md) 「배포 (Vercel)」 |
| 백엔드 배포 | `docker-compose.yml` (앱 · Postgres · cloudflared). 인바운드 포트를 열지 않는 터널 방식. **서버는 빌드하지 않는다** — `bash scripts/deploy.sh` 가 로컬에서 빌드해 `docker save`/`load` 로 서버에 넣는다(레지스트리 없음). 대상은 GCE e2-micro 라 compose 에 메모리 상한이 걸려 있다 |
| 환경변수 | `backend/.env.example`(앱) · `.env.example`(compose) · `frontend/.env.example` 에 전량 + 빠뜨렸을 때의 증상까지 기재 |
| DB 스키마 | 기동 시 Flyway 자동 적용 |
| OpenAI 키 없이 | `APP_MODE=mock` 으로 전 경로가 목업으로 동작 |
| Vector Store 없이 | `live` 라도 기동·응답은 되며, 출처가 0건이라 전부 "자료 없음"으로 표시됨 |

정해야 할 것과 남은 항목은 `docs/04_tasks/backlog.md` 에 있다.
계층별 배포 절차는 [backend](./02_architecture/backend.md) · [frontend](./02_architecture/frontend.md) 참고.

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
| [Backend](./02_architecture/backend.md) | 레이어 · 인증 · SSE 계약 · 유량 제어 · **배포와 호스트 선정 근거** |
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

**비어 있는 자리** : 위 표에 `지금 비어 있음` 이라 적힌 곳과 `99_inbox/` · `02_architecture/diagrams/` ·
`04_tasks/completed/` 는 `project-docs` 스킬 골격을 지키느라 `.gitkeep` 으로 자리만 잡아 둔 것이다.
**들어가 봐야 아무것도 없으니 헛걸음하지 말 것** — 대신 쓸 것이 생기면 새 자리를 만들지 말고 여기에 넣는다.
`99_inbox/` 는 `/project-docs-gen` 산출물이 먼저 떨어지는 임시 보관함이다. 검토해 `01_specs/` 로 옮기고 비운다.

**두지 않는 것** : 정보구조도 · 플로우차트 · 와이어프레임 · 시나리오 케이스 · 역할 매트릭스 ·
기술 스택 결정서. 1인 개발에서는 구현과 위 문서가 정본이라 별도 문서가 곧 낡은 사본이 된다.
각 문서의 판단 근거는 남겼다 — 호스트 선정과 역할 설계는 `docs/02_architecture/backend.md`,
리스크는 `docs/02_architecture/overview.md` 「알려진 제약」이다.

## AI 사용 가이드

이 프로젝트에서 AI와 협업할 때:
1. 먼저 이 `INDEX.md`를 읽어서 프로젝트 전체를 파악
2. `docs/CONVENTIONS.md`를 참고하여 코드 스타일 준수
3. `docs/FEEDBACK.md`에 대기 중인 수정 요청이 있으면 먼저 확인
4. 작업 후 "리뷰해줘"로 코드 리뷰 & 변경사항 기록

문서에 없는 파일 경로를 적으면 CI의 `scripts/check-doc-refs.sh`가 실패한다. 푸시 전에 `bash scripts/check-all.sh docs` 로 미리 확인할 수 있다.

루트 `CLAUDE.md`의 행동 지침(가정 금지 · 단순함 우선 · 외과적 변경 · 목표 기반 실행)이 위 규칙보다 우선한다.
