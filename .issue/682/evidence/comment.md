## #682 iOS 키보드 열림 · 닫힘 — 전후

**원인(근거)** : iOS Safari 는 `visualViewport` resize 를 키보드 애니메이션이 **끝난 뒤** 보낸다([WebKit bug 300523](https://bugs.webkit.org/show_bug.cgi?id=300523) · [198347](https://bugs.webkit.org/show_bug.cgi?id=198347)). 입력칸에 포커스가 가면 화면 전체를 민다([Apple forums 824765](https://developer.apple.com/forums/thread/824765)). `interactive-widget` 은 Safari 미지원([WebKit bug 259770](https://bugs.webkit.org/show_bug.cgi?id=259770)). 그래서 열릴 때 「밀림 → 끝난 뒤 줄어듦」 두 번 움직이고, 닫힐 때 「다 내려간 뒤 늘어남」. #668 의 requestAnimationFrame 이 한 프레임 더 늦췄다.

**수정** (`ChatPage.tsx` 뷰포트 효과만)
- 닫힐 때 : 입력칸 `focusout`(다른 입력칸으로 옮겨 가는 경우 제외)에서 루트 높이를 **즉시** 되돌린다 — 키보드가 내려가는 동안 화면이 같이 늘어남
- 열릴 때 : 한 번 연 키보드 높이를 화면 방향(innerHeight)별로 기억해 두고, 다음 `focusin` 에 **미리** 그만큼 줄인다 — 입력칸이 이미 키보드 위라 Safari 가 밀 이유가 없게(첫 열림은 예전처럼)
- 이벤트 반영은 프레임을 기다리지 않음(React 를 거치지 않아 즉시여도 싸다) · 같은 값 건너뛰기 · 확대 중 무시(#221) · 다시 그리기 0(#668) 유지

**헤드리스 측정** (`m682.mjs`, 가짜 visualViewport · 키보드 300px, 루트 높이)

| 시점 | 전 | 후 |
|---|---|---|
| 모바일 · 키보드 열림 이벤트 직후 | (비어 있음 — 한 프레임 뒤 반영) | 544px |
| 모바일 · 입력칸 포커스 잃은 직후 | 544px (그대로) | (비어 있음 = 100dvh) |
| 모바일 · 키보드 사라짐 이벤트 직후 | 544px | 844px |
| 모바일 · 두 번째 포커스 순간 | 844px | **544px (미리 줄어듦)** |
| React 커밋 · 문서 scrollTop | 0 · 0 | 0 · 0 |
| 데스크톱 1440 (포커스 · 해제) | 변화 없음 | 변화 없음 |

원자료 : `before/measure.json` · `after/measure.json`. Safari 의 화면 밀기 자체는 헤드리스로 재현되지 않는다 — **실기기 확인 필요**.
