## 작업 리포트 — #274

**변경** : `index.css` 에 `@utility scrollbar-none`(Firefox `scrollbar-width: none` + Chromium/Safari `::-webkit-scrollbar { display: none }`), 사이드바 대화 목록 `nav` 에 적용. 스크롤 동작은 그대로.

| 화면 | before | after |
|---|---|---|
| 데스크탑 사이드바 | ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/274/evidence/before/sidebar-desktop.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/274/evidence/after/sidebar-desktop.webp) |
| 모바일 서랍 390 | ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/274/evidence/before/sidebar-mobile.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/274/evidence/after/sidebar-mobile.webp) |

| 측정(실제 Chrome 141 · Windows 11) | before | after |
|---|---|---|
| 스크롤바 폭(offsetWidth − clientWidth) | 15px · 15px | **0px · 0px** |
| 스크롤 | — | 마우스 휠 5칸 → 500px 이동, 서랍 400px 이동 |

- 프론트 lint · vitest 148/148(새 2건) · build 통과. 케이스 하한 140 → 148
- headless 캡처는 스크롤바를 그리지 않아 실제 Chrome 캡처를 webp 로 바꿔 박스를 그렸다
