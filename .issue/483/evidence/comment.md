## 결과 리포트 — 브랜치 `fix/483-frontend-low-bundle` (커밋 2b8b857 · 069997f)

### 바꾼 것

- F4 관리자 목록 첫 로드 실패 시 「아직 문서가 없습니다」 대신 오류 + 「다시 시도」 · 사용자 수 머리도 로드 성공 때만
- F5 제목 편집 Esc · Enter 뒤 언마운트 blur 가 저장하지 않게(`skipBlurRef`, 다시 열면 해제)
- F12 `localStorage` 가 막혀도 백지가 되지 않게 — 토큰은 메모리 폴백(새로고침 전까지), setItem 실패 시 removeItem 재시도, 사이드바 폭은 기본값
- F13 관리자 폴링 · 작업 후 refresh 의 늦은 응답을 요청 세대로 버림
- F14 첨부 5 · 본문 4000 · 제목 100 상한을 `lib/limits.ts` 로
- F17 200 전 판정 중에는 정지 버튼 대신 비활성 보내기 + 늘 있는 `role="status"` 칸에 「보낸 글이 저장됐는지 확인하는 중입니다」

### 검증

- +14건(관리자 4 · 채팅 3 · 저장소 차단 2 · 사이드바 1 · limits 1 · useChat 1 · Composer 2). 1차 고치기 전 10건 실패(새 9 + 영향 1). 프론트 271/271
- 리뷰 : opus 리뷰 MED 1(판정 이유가 title 에만) · LOW 4 → 반영

### 증거

[before/targeted-tests.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/483/evidence/before/targeted-tests.txt) · [after/targeted-tests.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/483/evidence/after/targeted-tests.txt) · [before/code-grep.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/483/evidence/before/code-grep.txt) · [after/code-grep.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/483/evidence/after/code-grep.txt) · [after/review-verify-summary.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/483/evidence/after/review-verify-summary.txt)

### 미측정 · 한계

- F5 Chrome 실기 재현은 하지 않음 — jsdom 에서 act 안에 blur 를 쏘는 테스트로 잠금

### 배포

- 프론트(Vercel 자동)

> 10-26 전체 리뷰 후속 2차(#483 · #488 · #489). 이슈는 통합 검증 뒤 닫는다.
