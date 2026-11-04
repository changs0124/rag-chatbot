## #588 리포트 — 판정 표시 · 첫 목록 로드의 소유 검사

**변경** — `useChat.ts`
1. `run` 의 `finally` : `judgingRef.current = null` → `if (judgingRef.current === controller) judgingRef.current = null` — 바로 아래 `abortRef` 처럼 자기 턴일 때만 지운다
2. 마운트 때 첫 `listConversations()` 도 `++listGen.current` 를 잡고 같을 때만 반영(#557 과 같은 방식)

**before** — 새 테스트를 현행 코드에 돌리면 둘 다 실패
- 판정 : 앞 턴 판정 중 c9 로 옮김 → 둘째 턴도 판정 → 앞 턴 판정 끝 → c10 으로 옮겨도 `streaming` 이 `true` 로 남아 보내기 막힘 (`.issue/588/evidence/before/judging-on-main.txt`)
- 첫 목록 : 첫 GET 이 늦는 사이 새 대화 N 생성 → 늦은 응답 `[A]` 가 덮어 N 이 사라짐 (`.issue/588/evidence/before/first-list-on-main.txt`)

**after** — 두 테스트 통과 · 전체 322/322 · tsc · oxlint · 문서 게이트 통과 (`.issue/588/evidence/after/test-after.txt`)

**문서** — `frontend.md` 목록 세대 줄(첫 로드 포함) · CHANGELOG [Unreleased] Fixed · 프론트 하한 → 322
**배포** — 프론트라 merge 때 Vercel 이 반영
