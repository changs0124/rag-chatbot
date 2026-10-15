# before — 2026-10-15, main `16a847f` · Chrome 141(Windows 11, 실제 브라우저) · 관리자 계정(대화 40여 개)

| 화면 | 대화 목록 `nav` 스크롤바 폭(offsetWidth − clientWidth) | 보이는가 |
|---|---|---|
| 데스크탑 1920 폭 사이드바 | **15px** | 회색 막대 + 위아래 화살표 |
| 모바일 390 폭 서랍(같은 출처 iframe) | **15px** | 같음 |

headless Chromium 캡처(`capture.mjs`)는 스크롤바를 그리지 않아 재현되지 않는다 — 실제 Chrome 캡처를 webp 로 바꿔 박스를 그렸다.
