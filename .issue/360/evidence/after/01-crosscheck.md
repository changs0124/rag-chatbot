# 문서 ↔ 코드 대조표 (2026-10-16, main 8a54bce 기준)

## 고친 것

| 문서 | 변경 전 주장 | 코드 근거 | 처리 |
|------|--------------|-----------|------|
| features.md FEAT-OPS-002 | SSE 도중 오류는 폴백 대상 아님 | `GlobalExceptionHandler.handleUnexpected` 가 비동기 디스패치로 받아 커밋 시 로그만(#326) | 사실로 고침 |
| api.md API-POST-005 | 타임아웃 뒤 앱 코드가 한 줄도 안 돈다 | `handleAsyncTimeout` 이 WARN 로그(TC-OPS-032) | 이유를 고침(결론 동일) |
| design-system.md 모션 | 속성은 transform · opacity · background-color 만 | `transition-[border-color,box-shadow]` 2곳 · `transition-colors` 다수 | 허용 목록을 실제에 맞춤 |
| overview.md 하드 한도 | 파일 26MB · 요청 31MB 만 | `server.tomcat.max-swallow-size: 32MB` | 함께 적음 |
| README 기술 스택 | `postgres:16-alpine` | compose 가 다이제스트 고정(#357) | 고정 사실 추가 |
| README CI 표 | frontend 잡에 런타임 대조 없음 | ci.yml frontend 잡 `check-runtime-versions.sh node` | 추가 |
| backlog.md | 착수 시 결정할 것 6항목 | - | 권장안(10-16) 한 줄씩 |

로그인 상한 「시도 → 실패」(backend.md · README)는 코드 변경과 함께 #359 에서 고쳤다.

## 대조해 일치한 것

- API : 컨트롤러 8개의 경로 23개 ↔ api.md §2 — 누락 · 초과 0, 상태 코드(201 둘 · 204 셋 · 나머지 200) 일치, `ApiError` 코드 12개 일치
- ERD : V1~V9 마이그레이션 ↔ erd.md — 컬럼 · 타입 · nullable · CHECK · FK 삭제 규칙 · 인덱스 9 · 트리거 일치
- 환경변수 : application.yml `${…}` 31개 ↔ `backend/.env.example` 누락 · 초과 0, 루트 `.env.example` 4개 ↔ compose, `frontend/.env.example`
- 설정값 : 레이트리밋 20/30/5/10 · 동시 스트림 16/1 · SSE 600000ms · 읽기 540000ms · 이력 예산 6000 · JWT 120/30 · 파일 토큰 15 · 고아 60(하한 10) · compose 메모리 · pids · cap_add · 로그
- 테스트 ID : 문서가 인용한 TC-OPS-014~019 · 028~031 · 032~034 가 해당 테스트에 있음(#351 · #355 재번호 반영)
- REQ 28 · FEAT 11 · API 24 교차 참조가 모두 정의로 이어짐
- CI 7잡 ↔ ci.yml, #349 · #350 · #357 서술 ↔ 코드
- 링크 : `check-doc-refs.sh` · `check-doc-sections.sh`(37건) 통과, `.linkignore` 4건 모두 여전히 부재(STALE 없음)

## 게이트

`bash scripts/check-all.sh docs` 통과(shellcheck 만 로컬 미설치로 건너뜀) · `check-doc-versions.sh` 24건 통과
