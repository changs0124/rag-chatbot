# rag-chatbot

> OpenAI API(GPT-4o) + OpenAI 플랫폼 Store(VectorDB) 기반 RAG 챗봇. 출처를 항상 표기하고, 자료가 없으면 그 사실을 밝힌 뒤 추론함.

**유형** : 신규 · **규모** : 정식(1주~1개월) · **착수일** : 2026-07-24

프로젝트 문서는 `docs/`에 있음. 진입점은 `docs/INDEX.md`.

## 구조 (모노레포)

- `frontend/` - React + Vite + TypeScript. 반응형 웹(PC + 모바일 브라우저). Claude/GPT 류 채팅 UI
- `backend/` - Spring Boot + Java 17 + Maven(Wrapper) + MyBatis
- `docs/` - 프로젝트 문서(구조 · 컨벤션 · 태스크 · 이슈 · 변경 이력). 진입점은 `docs/INDEX.md`

## 툴체인 (0-A에서 고정 · 확인일 2026-08-18)

| 도구 | 버전 | 고정 위치 |
|------|------|-----------|
| Node.js | 24.19.0 | `.nvmrc` (major 24) |
| npm | 11.17.0 | Node 동봉 |
| Java(JDK) | 17.0.19 LTS | `backend/pom.xml`의 `java.version` (백엔드 스캐폴딩 시) |
| Maven | Wrapper로 부트스트랩 | `backend/.mvn/wrapper/maven-wrapper.properties` (전역 `mvn` 미설치 대응) |
| Git | 2.54 | - |

> 전역 `mvn`이 설치되어 있지 않아 **Maven Wrapper(`mvnw`)** 로 Maven 버전을 저장소에 고정함. CI도 `mvnw`를 호출해 로컬과 버전이 갈리지 않게 함.

## 핵심 요구 (요약)

- 입력 4종 : 파일 첨부 · 카메라 촬영 · 사진 업로드 · 텍스트 질문
- 이미지는 GPT-4o 비전으로 전달 + 대화에 저장
- 사용자별 로그인(자체 이메일/비밀번호) + 마이페이지(이름 · 비밀번호 · 테마 변경)
- 사용자별 대화 저장/조회
- 답변에 항상 출처 표기. 자료를 못 찾으면 "자료 없음" 을 밝힌 뒤 추론으로 답변
  (텍스트 접두가 아니라 **출처 0건에서 파생한 표시**임 - 라이브는 인용 유무를 스트림이 끝나야 알 수 있어
  이미 흘려보낸 토큰 앞에 접두를 붙일 수 없음)
- API KEY · VectorDB 미구축 → 인터페이스 완성 + 응답만 목업(`APP_MODE=mock`)

## 배포 준비 상태

키·Vector Store·서버만 준비하면 도는 상태로 맞춰 둠.
프론트는 Vercel(https://rag-chatbot-jade-pi.vercel.app), 백엔드는 자체 호스팅 + Cloudflare Tunnel 임.
**준비물 표는 `docs/INDEX.md` 「배포 준비 상태」가 정본**이고, 계층별 절차는
`docs/02_architecture/backend.md` · `docs/02_architecture/frontend.md` 에 있음.

배포 시 빠뜨리기 쉬운 두 가지 : 백엔드 `ALLOWED_ORIGINS`(빠뜨리면 CORS 로 전 API 차단),
프론트 `VITE_API_BASE_URL`(빠뜨리면 번들이 localhost 호출).

## 현재 상태

- 진행 중인 작업은 `docs/04_tasks/current-sprint.md`, 남은 항목은 `docs/04_tasks/backlog.md`.
