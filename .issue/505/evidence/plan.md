# #505 계획 — 첫 토큰 전 확인창 이동 시 옮겨 간 화면 입력창 잠김

## 1. 이슈 요약
- 문제 : 토큰 0개(단계 표시 중)에 #503 확인창에서 「중단하고 이동」 → 옮겨 간 화면 입력창이 「보낸 글이 저장됐는지 확인하는 중」(settling)으로 잠김. 확인창 문구 「지금까지 받은 부분만 남습니다」는 그 경우 거짓(질문 · 입력 글까지 사라짐)
- 완료 기준 : 순서 재현 테스트(수정 전 실패) · 기존 판정/경쟁 테스트 통과 · 문구 갱신 · frontend.md · CHANGELOG · 하한

## 2. 원인 (`frontend/src/hooks/useChat.ts`)
- `selectConversation` / `newConversation` 이 `abortActiveStream()` 뒤 `generation++`(:210-212 · :237)
- `abortActiveStream` 은 `judgingRef.current === abortRef.current` 일 때만 놓아 줌(:193) — 이동이 중단을 일으킨 순간엔 아직 판정 전이라 judgingRef 가 null
- 그 뒤 `run` catch 가 `setSettling(true)` · `judgingRef = controller`(:442-444) → finally(:494)까지 잠김

## 3. 작업 계획
1. `useChat.ts` catch 의 `if (unconfirmed)` : 판정 표시 직후, 이미 대화를 옮겼으면(`generation.current !== mine`) 자기 컨트롤러일 때만 `abortRef=null` · `setStreaming(false)` 로 놓아 주고 settling 은 세우지 않음. 판정은 뒤에서 이어 감(finally 는 자기 컨트롤러 아니면 상태 안 건드림 — 그대로)
2. `ChatPage.tsx:255` 문구 : 「답변 생성이 멈추고, 지금까지 받은 부분만 남습니다. 답이 시작되기 전이면 보낸 질문도 남지 않습니다.」 + `ChatPage.test.tsx` 단언
3. `useChat.test.ts` : send → 토큰 0개(stage 만) → stop 없이 selectConversation / newConversation → streaming · settling false (2건)
4. `frontend.md` 「대화를 떠나면」 · CHANGELOG [Unreleased] Fixed · `case-floors.env` FRONTEND_MIN 293→295

## 4. 검증
- `cd frontend && npx vitest run src/hooks/useChat.test.ts src/hooks/useChatRace.test.ts src/pages/ChatPage.test.tsx` → `npm test` · `npm run lint` · `npm run build`
- `bash scripts/check-all.sh docs`

## 5. 증거
- 테스트 : before = 새 테스트를 원 코드에 붙여 실패 기록(`before/useChat-test.txt`), after = 통과(`after/useChat-test.txt` · `after/frontend-full.txt`)
- 화면 : 빌드 SPA + 목업(scratchpad tools, 스트림이 단계만 내고 8초 멈춤 · 판정 GET 4초 지연), 1440x900. A/S 대화에서 전송 → 1.5초 뒤 「납품 일정 확인」 클릭 → 확인창 「중단하고 이동」 → 1초 뒤 캡처. 박스 = 입력창 영역(`form` 또는 Composer 루트). before : 잠김 문구 · 보내기 비활성 / after : 정상 입력창
- 확인창 문구 after 캡처 1장(박스 = `[role=dialog] > div.relative`)

## 6. 미해결 질문
- 없음(문구는 이슈 본문 예시대로)
