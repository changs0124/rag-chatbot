## #601 리포트 — 새 대화 첫 턴의 status 그릇

**변경** — `MessageList.tsx` : 낭독용 `role="status"`(`sr-only`)를 빈 화면 · 목록 두 분기 모두 **조각의 두 번째 자식**으로 둔다 — React 가 같은 요소로 이어 써서 첫 전송 때도 그릇이 이미 있다. 보이는 단계 줄은 목록 안에 그대로 두고 `aria-hidden`(두 번 읽히지 않게). `sr-only` 는 절대 위치라 레이아웃 변화 없음

**before** — 새 테스트(빈 화면 → 첫 턴에서 같은 status 요소)를 현행 코드에 돌리면 실패 : 빈 화면에 status 없음 (`.issue/601/evidence/before/tests-on-main.txt`)

**after** — 전체 332/332 · tsc · oxlint · 문서 게이트 통과 (`.issue/601/evidence/after/test-after.txt`)

**문서** — CHANGELOG [Unreleased] Fixed · 프론트 하한 331 → 332
