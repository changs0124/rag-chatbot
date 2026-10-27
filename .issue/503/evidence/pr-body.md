Refs #503

관련 이슈 : [#503 스트리밍 중 대화 이동 · 새 채팅 시 중단 확인창](https://github.com/changs0124/rag-chatbot/issues/503) (통합 테스트 뒤 close)

## 요약 — 브랜치 `feat/503-leave-confirm`

### 바꾼 것

- `ChatPage.tsx` — 이동 대상(`LeaveTarget`)을 상태로 두고, `streaming && !settling` 이면 `ConfirmModal`(「중단하고 이동」)을 거친다. 확인 → 기존 `newConversation` · `selectConversation` 그대로, 취소 → 아무 변화 없음(드로어 유지)
  - 묻지 않는 경우 : 스트리밍 아님 · 판정(`settling`) 중 · 지금 대화 재클릭(#359)
  - 핸들러 deps 에 `guardLeave` · `activeId` 추가 — 턴마다 두 번만 바뀌어 #405 의 사이드바 memo 는 토큰마다 무너지지 않는다(`ChatPageRender` 테스트 통과)
- `useChat.ts` 중단 로직은 건드리지 않았다
- `ChatPage.test.tsx` 9건 · `FRONTEND_MIN` 283 → 292 · `frontend.md` 「대화를 떠나면」 · CHANGELOG [Unreleased] Added

### 검증

- 새 테스트를 변경 전 `ChatPage.tsx` 에 돌림 : 확인창 6건 **실패** · 회귀 3건 통과 → 변경 뒤 9건 통과
- 프론트 lint · tsc · build · 테스트 292/292 · check-all docs(shellcheck 는 로컬에 없어 건너뜀)

### 증거

[전후 리포트 보기](https://github.com/changs0124/rag-chatbot/issues/503#issuecomment-6430427991) · [before/ChatPage-test.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/503/evidence/before/ChatPage-test.txt) · [after/ChatPage-test.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/503/evidence/after/ChatPage-test.txt)

### 미측정 · 한계

- 화면 캡처는 빌드한 SPA + 목업 API(느린 SSE)로 찍었다. 실 백엔드 · 모바일 폭(390px) 캡처는 없다 — 드로어 유지는 테스트로만 확인
- 로그아웃 · 탭 닫기 때의 확인, 이동해도 서버가 끝까지 생성하는 방식은 범위 밖

### 배포

- 프론트(Vercel 자동) · 백엔드 변경 없음
