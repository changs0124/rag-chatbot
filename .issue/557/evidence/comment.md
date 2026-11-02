## #557 리포트 — 늦게 온 대화 목록 응답이 고침을 덮지 않게

`frontend/src/hooks/useChat.ts` — 관리 화면(#483 F13)과 같은 세대 카운터 `listGen`. `refreshConversations` 는 낼 때 세대를 올리고 응답 때 세대가 그대로일 때만 반영한다. **목록을 직접 고칠 때(삭제 · 이름 변경 · 새 대화 추가 · 404 로 빼기)도 세대를 올린다** — 고침 앞에 나간 요청이 고침 뒤에 돌아와도 막는다. 막힌 응답의 다른 변화는 다음 갱신이 받는다. 첫 로드는 가드하지 않는다(버려지면 빈 목록이 오류 없이 남을 수 있어서).

테스트(`useChatRace.test.ts` +1) : 목록 GET 보류 → 대화 삭제 → 옛 목록 도착 → 삭제 유지
- before : 실패(`['A','B']` 남음) — `.issue/557/evidence/before/test.txt`
- after : lint · 309 테스트 · build 통과 — `.issue/557/evidence/after/test.txt`

문서 : `frontend.md` 한 항목.
