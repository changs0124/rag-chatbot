## 결과 리포트 — 브랜치 `fix/501-recheck-window-8s`

### 바꾼 것

- `useChat.ts` `RECHECK_WINDOW_MS` 5000 → **8000**, 상수 주석에 근거(#489 운영 탐침 3.2~5.9초)
- `frontend.md` 판정 구간 · 남은 한계의 5초 서술을 8초로, 「배포 뒤 잰다」 문장을 실측 결과로
- CHANGELOG [Unreleased] · `FRONTEND_MIN` 282 → 283

### 검증

- 새 테스트 「질문이 6초 뒤에야 걷혀도 재확인 창 안이라 되돌린다」 : 5초 창에서 **실패**(giveBack 미호출) → 8초 창에서 통과
- 프론트 lint · tsc · build · 테스트 283/283 · check-all docs

### 증거

[before/useChat-6s.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/501/evidence/before/useChat-6s.txt) · [after/useChat-6s.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/501/evidence/after/useChat-6s.txt) · [after/frontend-full.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/501/evidence/after/frontend-full.txt)

### 미측정 · 한계

- 감지 시간 자체는 바뀌지 않는다 — 8초를 넘는 감지(실측 최대 5.9초 밖)는 여전히 「저장됨」. 근본 해결은 첫 토큰 전 heartbeat(미등록 후보)
- 판정 구간(「확인 중」 · 보내기 비활성)이 최대 약 8초 + 왕복으로 길어진다

### 배포

- 프론트(Vercel 자동) · 백엔드 변경 없음
