## #590 리포트 — 접근성 규칙(#484) 어긋난 곳

**변경**
- `MessageList` 진행 단계 줄 : `role="status"` 그릇을 늘 두고 단계 문구만 넣는다. 끝 표식(`endRef`)과 한 묶음(`<div>`)으로 감싸 flex 자식 수가 전과 같고, 단계 줄이 있을 때 `mt-6` 로 전과 같은 간격 — 레이아웃 변화 없음
- `ChatPage` 대화 불러오는 중 : 스피너 `div` 의 `role` 을 떼고, 늘 있는 `sr-only` `role="status"` 에 「대화 불러오는 중」을 넣었다 뺀다
- 이름 : 메시지 입력창 `aria-label="메시지 입력"` · 제목 편집 `aria-label="대화 제목"` · 여러 장인 썸네일 「첨부 이미지 2/3 확대」(한 장이면 그대로) · 사이드바 현재 대화 `aria-current="page"`

**before** — 새 · 고친 테스트를 현행 코드에 돌리면 7건 실패(그릇 없음 · 이름 없음 · aria-current 없음) (`.issue/590/evidence/before/tests-on-main.txt`)

**after** — 전체 329/329 · tsc · oxlint · 문서 게이트 통과 (`.issue/590/evidence/after/test-after.txt`). 화면 캡처는 생략 — 보이는 요소는 바꾸지 않았고(속성 · `sr-only` 만), 단계 줄 간격은 flex 자식 구조로 같게 맞췄다

**문서** — `design-system.md` 접근성 규칙(번호 붙이기 · `aria-current`) · CHANGELOG [Unreleased] Fixed · 프론트 하한 327 → 329
**배포** — 프론트라 merge 때 Vercel 이 반영
