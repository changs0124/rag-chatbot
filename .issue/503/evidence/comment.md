## 작업 요약

답을 받는 중에 사이드바의 다른 대화나 새 채팅을 누르면, 끊기 전에 「답변을 중단하고 이동할까요?」 확인창을 띄운다.
확인하면 지금처럼 중단한 뒤 옮기고, 취소하면 스트림과 모바일 드로어를 그대로 둔다. 판정(`settling`) 중이거나 지금 대화를 다시 누를 때(#359)는 묻지 않는다.

## 변경 전후

| 전 | 후 |
| --- | --- |
| ![답변 중 다른 대화 클릭 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/503/evidence/before/leave-while-streaming.webp) | ![답변 중 다른 대화 클릭 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/503/evidence/after/leave-while-streaming.webp) |

같은 조작 : 「A/S 접수 절차 문의」에서 질문을 보내고 3.5초 뒤 답이 흐르는 중에 「납품 일정 확인」을 누른 다음 0.8초 뒤에 찍었다(1440x900).
- 전 : 묻지 않고 「납품 일정 확인」으로 넘어갔다. A/S 답변은 끊겼다. 빨간 박스는 넘어간 본문 영역이다
- 후 : 빨간 박스 안의 확인창이 떴다. 뒤에서 A/S 답변이 계속 흐르고, 입력창에는 정지 버튼이 보인다

캡처는 빌드한 SPA 에 느린 SSE 를 내는 목업 API 를 같은 출처로 붙여 찍었다. 실 백엔드는 쓰지 않았다.

## 변경 파일

- `frontend/src/pages/ChatPage.tsx` — 이동 대상을 상태로 두고, `streaming && !settling` 이면 `ConfirmModal` 을 거친다. 중단 로직(`useChat`)은 그대로
- `frontend/src/pages/ChatPage.test.tsx` — 9건 추가
- `scripts/case-floors.env` — `FRONTEND_MIN` 283 → 292
- `docs/02_architecture/frontend.md` · `docs/06_changelog/CHANGELOG.md`

## 검증

- 새 테스트를 지금 코드(`ChatPage.tsx` 변경 전)에 돌린 결과 : 확인창 케이스 6건 실패, 회귀 케이스 3건 통과 — [before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/503/evidence/before/ChatPage-test.txt)
- 변경 뒤 : 9건 모두 통과 — [after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/503/evidence/after/ChatPage-test.txt)
- `npm run lint` · `npx tsc -b` · `npm test`(30 파일 · 292건 통과, [기록](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/503/evidence/after/frontend-full.txt)) · `npm run build` 통과
- `bash scripts/check-all.sh docs` 통과(shellcheck 는 로컬에 없어 건너뜀)

## 남은 이슈

- 모바일 폭(390px) 캡처는 찍지 않았다. 드로어에서 취소해도 드로어가 열린 채 남는 것은 테스트 「취소해도 모바일 드로어는 열린 채로 둔다」로 확인했다
- 로그아웃이나 탭 닫기 때의 확인, 서버 백그라운드 생성은 범위 밖이다(이슈 본문 「범위 밖」)
