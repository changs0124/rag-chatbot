## #221 작업 리포트 — 모바일 헤더가 스크롤·키보드에 밀려 올라감

**먼저 밝혀 둘 것** : 헤드리스 Chromium 모바일 에뮬레이션(390x844 · 터치)에서는 **변경 전에도 재현되지 않았다.** 문서 높이가 뷰포트와 같아(844) `window.scrollTo(0,300)` · 목록 끝 오버스크롤 제스처 · 입력 포커스 후 `scrollIntoView` 모두 헤더 위치 0 이었다. 증상은 에뮬레이션이 흉내 내지 못하는 실기기 동작에서 온다 — **iOS·Android 실기기 확인이 필요하다.**

**원인 (플랫폼 동작)**
1. 가상 키보드가 열려도 `100dvh` 는 줄지 않고, 보이는 영역(`visualViewport`)만 줄며 입력 쪽으로 이동한다 → 헤더가 화면 밖
2. iOS 는 스크롤되지 않는 문서도 가장자리에서 페이지 전체를 튕긴다(`html` 의 `overscroll-behavior: auto`)

**변경**
- `ChatPage` : 떠 있는 동안 `html` 에 `overflow: hidden` · `overscroll-behavior: none` (떠나면 복원 — 관리·마이 페이지는 그대로). `visualViewport` resize/scroll 마다 루트 높이 = 보이는 영역 높이, `scrollTo(0, 0)`
- `index.html` viewport : `interactive-widget=resizes-content` (Android Chrome 108+ 은 키보드만큼 레이아웃 자체가 줄어든다. Safari 는 무시)

| 측정 (390x844 에뮬레이션) | 변경 전 | 변경 후 |
|---|---|---|
| `html` overflow / overscroll-behavior | visible / auto | hidden / none |
| viewport meta | `width=device-width, initial-scale=1.0` | `… , interactive-widget=resizes-content` |
| 오버스크롤 · scrollTo · 포커스 후 헤더 위치 | 0 / 0 / 0 | 0 / 0 / 0 (회귀 없음) |
| 보이는 영역 500 으로 축소(키보드 근사) | — (변경 전 미측정) | 헤더 0 · 루트 500 · 입력 칸 하단 488 |

| 변경 전 — 입력 포커스 | 변경 후 — 입력 포커스 | 변경 후 — 보이는 영역 500 |
|---|---|---|
| ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/221/evidence/before/mobile-focus.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/221/evidence/after/mobile-focus.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/221/evidence/after/mobile-keyboard-sim.webp) |

박스 : 헤더. 「보이는 영역 500」은 뷰포트 자체를 줄인 근사라 iOS 의 실제 키보드 동작(레이아웃 유지 + 보이는 영역 이동)과 같지 않다.

- 검증 : `npm run lint` · vitest 122 통과(+2 : 보이는 영역 축소 시 루트 높이·scrollTo(0,0) / 떠나면 html 스타일 복원) · `npm run build` · doc 게이트 4종 · 케이스 하한 122/122
- 원본 : `before/measure.json` · `after/measure.json`
- **미확인** : iOS Safari 키보드·튕김, Android Chrome 키보드 — 실기기에서 확인 부탁
