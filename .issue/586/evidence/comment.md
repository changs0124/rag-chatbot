## #586 리포트 — #558 재서명 세대 가드 테스트가 가드를 실제로 지킨다

**변경** — `useChat.test.ts` 「받는 사이 다른 대화로 옮겼으면 결과를 버린다」 : `newConversation()`(빈 화면) 대신 **같은 첨부 id `a1` 을 가진 다른 대화 `c2`** 로 옮긴 뒤, 늦게 온 `/fresh` 가 반영되지 않고 `/c2` 가 남는지 본다. 코드 변화 없음(테스트만).

**before** — 현행 테스트 + `useChat.ts:270` 세대 가드를 지운 코드 → **2/2 통과**(가드가 없어도 잡지 못함) (`.issue/586/evidence/before/mutation-guard-removed.txt`)

**after** — 새 테스트 + 같은 변이 → **실패** `expected '/fresh' to be '/c2'` (`.issue/586/evidence/after/mutation-guard-removed.txt`) · 원래 코드에서는 318/318 · tsc · oxlint 통과

**문서** — CHANGELOG [Unreleased] Tests · 케이스 수 변화 없음(318)
**배포** — 불필요(테스트만)
