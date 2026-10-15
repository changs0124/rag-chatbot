# after — 2026-10-15, 브랜치 `feat/274-hide-sidebar-scrollbar` `eda6150` · 같은 Chrome · 같은 계정

| 화면 | 스크롤바 폭 | 스크롤 |
|---|---|---|
| 데스크탑 1920 폭 사이드바 | **0px** (before 15px) | 마우스 휠 5칸 → scrollTop 500 · `scrollBy(600)` → 600 |
| 모바일 390 폭 서랍 | **0px** (before 15px) | `scrollBy(400)` → 400 |

- 프론트 `npm run lint` · `vitest` 148/148(새 2건 : 유틸리티가 Firefox · Chromium 둘 다 덮음, nav 에 `scrollbar-none` + `overflow-y-auto`) · `npm run build` 통과, 번들 CSS 에 `scrollbar-width:none` 확인
- 케이스 하한 프론트 140 → 148(실측)
