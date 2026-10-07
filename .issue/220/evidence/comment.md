## #220 작업 리포트 — 문서↔코드 표류 16곳

체크리스트 16항목 전부 반영. 17개 파일 · +57 / −69. 게이트 6종 통과.

| 구분 | 고친 곳 |
|---|---|
| 거짓 진술 | README 「응답만 목업」 → mock/live 설명 · design-system `dark:` 허용 문장 삭제(전면 금지와 모순) · design-system 표의 낡은 줄 번호 6곳 제거 · api.md 임시 비밀번호 예시 `Xk7-mQ2p-9Vr4` → `Xk7m-Qp29-Vr4t`(생성기 4-4-4) · overview 백업 서술 → 매일 GCS(#132) · CONVENTIONS · check-doc-versions.sh 의 `docs` 잡 → `static` · `.env.example` 터널 토큰 → secrets 파일(#203) · `frontend/.env.example` 「빌드 경고」 → 런타임 콘솔 오류 · backlog 첨부 영속성 · `index.css` highlight 주석 |
| 모델 표기 | README · INDEX · overview 의 「GPT-4o」 고정 서술 → `OPENAI_MODEL`(기본 `gpt-4o` · 운영 `gpt-5.6-terra`). overview 다이어그램 노드는 모델 무관하게 「Responses API」 |
| 정본 중복 | overview 운영 파라미터 표(부분 사본) → `backend/.env.example` 링크(env 로 안 빠진 업로드 한도 한 줄만 남김) · overview URL 맵 → frontend 「라우팅」 링크 |
| 구조 | CHANGELOG 에 `## [2026-10-06]` 구획 — 10-06 까지 머지된 항목(#198 이하)이 아래, 10-07 머지분(#130 · #132 · #193 · #203 · #210 · #213 · #215 · #217~#221)이 `[Unreleased]` · 01_specs 5개 머리표 수정일 2026-10-07 · 상태 `초안` → `반영됨` · current-sprint 의 끝난 「Actions 한도 해소」 제거(CHANGELOG #135 에 기록 있음) · overview 머리 갱신일 |

**판정 메모**
- design-system 의 두 표는 같은 표가 아니었다(토큰 사용처 / 변경 기록) — 둘 다 두고 줄 번호만 뗐다
- CHANGELOG 구획 기준은 「머지 날짜」다. #130 · #132 · #193 · #203 은 런칭 작업이지만 머지가 10-07 이라 `[Unreleased]` 에 있다. 항목 본문은 고치지 않았다
- 운영 모델 값은 `live-integration.md` 의 「같은 값을 운영 `.env` 에 넣었다」(런칭 기록)와 09-22 실연동 기록(`gpt-5.6-terra`)에 근거했다 — 서버 `.env` 는 직접 읽지 않았다

문서만 바뀐 이슈라 캡처 대신 원문 대조를 남겼다 : [변경 전 원문](https://github.com/changs0124/rag-chatbot/blob/main/.issue/220/evidence/before/%EC%9B%90%EB%AC%B8.txt) · [변경 후 diff](https://github.com/changs0124/rag-chatbot/blob/main/.issue/220/evidence/after/%EA%B2%B0%EA%B3%BC.txt)
