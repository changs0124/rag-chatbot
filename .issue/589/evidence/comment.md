## #589 리포트 — 관리 문서 화면 「0건」 오표시 · 삭제 진행 중 가드

**변경** — `AdminDocumentsPage.tsx`
- 머리말 `문서 {N}건` → `문서{loaded && ` N건`}` : 다 읽기 전 · 첫 로드 실패 때는 「문서」만(#483 F4 와 같은 오독 방지)
- `confirmDelete` 를 사용자 관리(#483)와 같은 꼴로 : `deletingId` 진행 중 가드(삭제 버튼 비활성 · 「삭제 중…」) · 새 시도 때 `setError(null)` · 실패해도 목록 다시 읽기(먼저 지워진 404 행을 걷음)

**before** — 새 테스트 2개를 현행 코드에 돌리면 둘 다 실패 : 로딩 중 머리말이 「문서 0건」 / 새 삭제 시도 중에도 이전 「삭제하지 못했습니다」가 남음 (`.issue/589/evidence/before/tests-on-main.txt`)

**after** — `AdminDocumentsPage.test` 18/18 · 전체 320/320 · tsc · oxlint 통과 (`.issue/589/evidence/after/test-after.txt`). 화면 캡처는 생략 — 바뀐 것은 머리말 문구와 버튼 비활성뿐이라 테스트가 role · name 으로 직접 확인한다

**문서** — CHANGELOG [Unreleased] Fixed · 프론트 하한 318 → 320
**배포** — 프론트라 merge 때 Vercel 이 반영
