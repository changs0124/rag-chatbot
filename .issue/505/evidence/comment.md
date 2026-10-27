## 작업 리포트 — 첫 토큰 전 확인창 이동 시 입력창 잠김

브랜치 `fix/505-leave-before-token` · 구현 커밋 `a2be0ea` (프론트만)

### 원인
이동이 스트림을 끊는 순간엔 아직 판정 전이라 `abortActiveStream` 이 놓아 줄 것이 없었고(`useChat.ts` 의 `judgingRef` 검사), 그 뒤 `run` 의 catch 가 `settling` · 판정 표시를 세워 판정이 끝날 때까지 옮겨 간 화면의 보내기를 막았다.

### 변경
- `useChat.ts` : 판정 표시 직후 이미 대화를 옮긴 턴이면(세대가 다름) `settling` 을 세우지 않고, 자기 컨트롤러일 때만 잠금(`abortRef` · `streaming`)을 놓아 준다. 판정(빈 대화 정리 등)은 뒤에서 이어 간다
- `ChatPage.tsx` 확인창 문구 : 「… 지금까지 받은 부분만 남습니다. **답이 시작되기 전이면 보낸 질문도 남지 않습니다.**」
- 테스트 : `useChat.test.ts` 2건(다른 대화로 이동 · 새 채팅, stop 없이) + `ChatPage.test.tsx` 문구 단언 1건 · 하한 293 → 295
- `frontend.md` 「대화를 떠나면」 · CHANGELOG [Unreleased] Fixed

### 화면 (빌드 SPA + 목업 : 단계만 내고 8초 멈추는 스트림 · 판정 조회 4초 지연, 1440x900)
A/S 대화에서 전송 → 1.5초 뒤 「납품 일정 확인」 클릭 → 「중단하고 이동」 → 1초 뒤

| before | after |
|---|---|
| ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/505/evidence/before/leave-before-token.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/505/evidence/after/leave-before-token.webp) |
| 「보낸 글이 저장됐는지 확인하는 중」 · 보내기 잠김 | 문구 없음 · 바로 입력 가능 |

확인창 문구

| before | after |
|---|---|
| ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/505/evidence/before/confirm-dialog.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/505/evidence/after/confirm-dialog.webp) |

### 테스트
- before : 새 2건이 원 코드에서 실패 — [before/useChat-test.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/505/evidence/before/useChat-test.txt) (`expected true to be false`)
- after : 2건 통과 [after/useChat-test.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/505/evidence/after/useChat-test.txt) · 프론트 전체 30 파일 295/295 [after/frontend-full.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/505/evidence/after/frontend-full.txt) · lint · build 통과
- 문서 참조 · 섹션 검사 통과

### 그대로인 것
원래 화면에 머문 중단(정지 버튼)의 판정 · 되돌림 · 「확인 중」 표시, 판정 중 이동(#489 리뷰) 경로 — 기존 판정 · 경쟁 테스트(`useChat` · `useChatRace` · `ChatPage`, 83건) 통과
