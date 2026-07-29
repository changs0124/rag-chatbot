# rag-chatbot

> OpenAI API(GPT-4o) + OpenAI 플랫폼 Vector Store 기반 RAG 챗봇. 답변에 출처를 항상 표기하고, 자료가 없으면 그 사실을 밝힌 뒤 추론한다.

모노레포 : `frontend/` (React + Vite) · `backend/` (Spring Boot + MyBatis) · `docs/` (이 폴더)

## Tech Stack

| 영역 | 스택 |
|------|------|
| Frontend | React 19 · TypeScript 6 · Vite 8 · React Router 8 · Tailwind CSS 4 |
| Backend | Java 17 · Spring Boot 3.5.16 · Spring Security · MyBatis 3.0.5 · Maven Wrapper |
| Database | PostgreSQL (Flyway 마이그레이션, `backend/src/main/resources/db/migration/`) |
| 외부 연동 | OpenAI Chat(GPT-4o) + Vector Store — `APP_MODE=mock\|live`로 전환 |
| 저장소 | 로컬 디스크(`FILE_STORAGE_ROOT`) — `FileStorage` 인터페이스로 S3 교체 가능 |
| 테스트 | 백엔드 JUnit 5 + Testcontainers(실 PostgreSQL) · 프론트 Vitest + Testing Library |
| Lint | oxlint (프론트) |
| CI | GitHub Actions — `.github/workflows/ci.yml` (backend · frontend · docs · secrets · deps × 2) |

## 실행

```bash
# 백엔드 (backend/.env.example 참고 — APP_MODE, JWT_SECRET 필수)
cd backend && ./mvnw spring-boot:run     # http://localhost:8080

# 프론트 (frontend/.env.example 참고)
cd frontend && npm ci && npm run dev     # http://localhost:5173
```

`APP_MODE`는 기본값이 없다. 미설정이면 `AppModeGuard`가 기동을 막는다 — 목업이 우연히 켜지는 경로를 없애기 위한 의도적 설계다.

## 배포 준비 상태

코드는 **키·Vector Store·호스트만 채우면 도는 상태**로 맞춰져 있다.

| 준비물 | 상태 |
|--------|------|
| 프론트 배포 | `frontend/vercel.json` (SPA 리라이트 포함). Vercel 환경변수 `VITE_API_BASE_URL` 만 넣으면 됨 |
| 백엔드 배포 | `backend/Dockerfile` (호스트 무관 컨테이너, `PORT` 자동 대응) |
| 환경변수 | `backend/.env.example` · `frontend/.env.example` 에 전량 + 빠뜨렸을 때의 증상까지 기재 |
| DB 스키마 | 기동 시 Flyway 자동 적용 |
| OpenAI 키 없이 | `APP_MODE=mock` 으로 전 경로가 목업으로 동작 |
| Vector Store 없이 | `live` 라도 기동·응답은 되며, 출처가 0건이라 전부 "자료 없음"으로 표시됨 |

정해야 할 것과 남은 항목은 `docs/04_tasks/backlog.md` 에 있다.
계층별 배포 절차는 [backend](./02_architecture/backend.md) · [frontend](./02_architecture/frontend.md) 참고.

## Docs 구조

| 문서 | 설명 |
|------|------|
| [Specs](./01_specs/) | 기획·설계 문서 (요구사항, 기능명세, ERD 등) |
| [Architecture](./02_architecture/overview.md) | 시스템 전체 구조 · API 맵 · 데이터 흐름 |
| [References](./03_references/) | 외부 레퍼런스 (디자인, API, 라이브러리) |
| [Conventions](./CONVENTIONS.md) | 코드 스타일 & 패턴 규칙 |
| [Feedback](./FEEDBACK.md) | 다건 수정 요청 일괄 전달 |
| [Current Tasks](./04_tasks/current-sprint.md) | 현재 진행 중 작업 |
| [Backlog](./04_tasks/backlog.md) | 전체 태스크 |
| [Open Issues](./05_issues/open/) | 현재 이슈 |
| [Changelog](./06_changelog/CHANGELOG.md) | 변경 이력 |

## AI 사용 가이드

이 프로젝트에서 AI와 협업할 때:
1. 먼저 이 `INDEX.md`를 읽어서 프로젝트 전체를 파악
2. `docs/CONVENTIONS.md`를 참고하여 코드 스타일 준수
3. `docs/FEEDBACK.md`에 다건 수정 요청이 있으면 확인
4. 작업 후 "리뷰해줘"로 코드 리뷰 & 변경사항 기록

문서에 없는 파일 경로를 적으면 CI의 `scripts/check-doc-refs.sh`가 실패한다.

루트 `CLAUDE.md`의 행동 지침(가정 금지 · 단순함 우선 · 외과적 변경 · 목표 기반 실행)이 위 규칙보다 우선한다.
