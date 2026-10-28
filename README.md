# rag-chatbot

사내 문서를 근거로 답하는 RAG 챗봇이다. OpenAI Responses API 에 공용 Vector Store 를 `file_search` 로 붙여 답하고,
답변에는 근거 자료의 출처를 항상 함께 보여 준다. 「자료 없음」 표시는 텍스트 접두가 아니라 **출처 0건에서 파생**한다 —
자료가 없으면 그 사실을 밝힌 뒤 추론으로 답한다. 질문에 첨부한 이미지는 모델의 비전 입력으로 전달된다.

> **운영** — https://rag-chatbot-jade-pi.vercel.app
> 가입 화면은 없다. **계정은 관리자가 발급**하므로 계정 없이는 로그인 화면까지만 볼 수 있다.

## 주요 기능

**사용자**
- 이메일/비밀번호 로그인(가입 없음) · 마이페이지에서 이름 · 비밀번호 변경
- 대화 목록 · 이름 변경 · 삭제, 대화별 이력 저장과 재조회
- 이미지 첨부 — 기기 선택창 · 드래그앤드롭 · 붙여넣기. 고르는 즉시 올라가고 전송 전에 썸네일로 확인 · 확대 보기
  (jpeg · png · webp · gif, 이미지가 아닌 파일은 받지 않는다)
- 스트리밍 답변과 진행 단계 표시(분석 → 검색 → 참조 문서 확인 → 작성) · 정지 버튼(받은 데까지 저장)
- 출처 각주와 근거 스니펫 · 근거 문서에 관련 그림이 있으면 답변에 그림을 함께 표시

**관리자**
- 사내 문서를 제품 안에서 공용 Vector Store 에 업로드 · 삭제 · 스토어와 동기화(누가 언제 했는지 기록 · 인덱싱 실패 표시)
- 계정 발급(허용 이메일 도메인만) · 비밀번호 초기화 · 사용자 삭제(대화 · 첨부 함께, 문서를 올린 계정은 제외)

**운영**
- 사용자별 분당 상한 — 채팅 · 업로드 · 비밀번호 변경 · 로그인 실패(계정별)
- 동시 채팅 스트림 상한 — 전역 · 사용자당(초과는 429)
- `APP_MODE=mock` 이면 OpenAI 호출 없이 전 경로가 목업 응답으로 돈다
- 턴별 토큰 사용량 기록 · 요청 상관 ID · 고아 첨부 회수

기본값의 정본은 `application.yml`, 각 항목의 의미와 빠뜨렸을 때의 증상은 `backend/.env.example` 이다.

## 구조

```
frontend/   React SPA (Vercel 배포)
backend/    Spring Boot API · Flyway 마이그레이션 · Dockerfile
scripts/    품질 게이트 · 배포 스크립트 · 문서 그림 · 클레임 전처리
docs/       명세 · 아키텍처 · 태스크 · 변경 이력 (진입점 docs/INDEX.md)
```

구성도와 단일 인스턴스 전제 같은 제약은 `docs/02_architecture/overview.md` 에 있다.

## 기술 스택

| 영역 | 스택 |
|------|------|
| Frontend | React 19.2 · TypeScript 6.0 · Vite 8.1 · React Router 8.3 · Tailwind CSS 4.3 · react-markdown |
| Backend | Java 17 · Spring Boot 4.1.1 · Spring Security · MyBatis 4.1.0 · Flyway 12.4 |
| Database | PostgreSQL 16 (운영 compose 이미지 `postgres:16-alpine`, 다이제스트 고정) |
| 외부 연동 | OpenAI Responses API + Vector Store · 모델은 `OPENAI_MODEL`(기본 `gpt-6-sol`) |
| 테스트 | 백엔드 JUnit 6 + Testcontainers 2.0(실 PostgreSQL) · 프론트 Vitest 4.1 + Testing Library |
| Lint | oxlint 1.75 (프론트) |

툴체인 고정 : Node 는 `.nvmrc`(24) · Maven 은 Wrapper(`backend/mvnw`, 3.9.16)로 로컬과 CI 가 같은 버전을 쓴다
(도커 이미지 빌드만 예외 — 근거는 `docs/02_architecture/backend.md` 「배포」).

## 로컬 실행

환경변수 전량과 빠뜨렸을 때의 증상은 `.env.example` 파일 셋이 정본이다 —
`backend/.env.example`(앱) · `.env.example`(compose 의 DB 자격) · `frontend/.env.example`(프론트).

**목업 모드**(OpenAI 키 불필요)는 `APP_MODE=mock` · `JWT_SECRET` · `DB_*` 만 있으면 기동된다. 로그인하려면 `ADMIN_EMAILS` 도 준다(첫 계정은 여기서만 생긴다).
**실 연동 모드**는 여기에 `APP_MODE=live` · `OPENAI_API_KEY` · `OPENAI_VECTOR_STORE_ID` · `ALLOWED_EMAIL_DOMAINS` 를 더한다.

백엔드 — 둘 중 하나로 띄운다 :

```bash
# 1) Maven Wrapper — backend/.env 를 읽지 않는다. 환경변수를 셸에 직접 넣는다.
#    PostgreSQL 이 localhost:5432 에 있어야 한다(compose 의 db 는 호스트에 포트를 열지 않는다)
cd backend && ./mvnw spring-boot:run          # http://localhost:8080

# 2) docker compose — backend/.env 와 루트 .env(POSTGRES_PASSWORD)를 읽는다.
#    본체에 build 키가 없어 로컬 빌드는 override 를 겹친다
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build db app
```

compose 로 목업을 띄우는 법(`prod` 프로필과의 관계)은 `docs/02_architecture/backend.md` 「실행 모드」에 있다.

프론트 :

```bash
cd frontend && npm ci && npm run dev          # http://localhost:5173
```

CORS 기본값이 5173 하나라 다른 포트로 띄우면 `ALLOWED_ORIGINS` 를 함께 바꿔야 한다.

## 테스트와 CI

```bash
cd backend && ./mvnw verify                   # 테스트 + 빌드 (Testcontainers 라 Docker 필요)
cd frontend && npm run lint && npm test && npm run build
bash scripts/check-all.sh                     # CI 가 돌리는 검사를 푸시 전에 로컬에서 예행
```

CI 잡 · 케이스 수 하한 · 게이트 목록은 [CONVENTIONS](docs/CONVENTIONS.md) 「테스트·CI 게이트」가 정본이다.

## 배포 개요

- **프론트** — Vercel(`main` 푸시 시 자동 배포)
- **백엔드** — 단일 서버에 `docker-compose.yml`(앱 · PostgreSQL · cloudflared). 이미지는 `bash scripts/deploy.sh` 가 로컬에서 빌드해 옮긴다

절차 · 근거 · 백업은 `docs/02_architecture/backend.md` 「배포」 · `docs/02_architecture/frontend.md` 「배포 (Vercel)」에 있다.

## 문서

진입점은 [docs/INDEX.md](docs/INDEX.md) 다. 같은 사실은 한 곳에만 적는다. 문서 목록과 각 문서가 담는 것도 INDEX 에 있다.
