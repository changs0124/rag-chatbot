## 작업 요약

열리는 층 8곳이 렌더 프레임에 곧바로 완성 상태로 튀어나오던 것을, 들어올 때 한 번 움직이게 했습니다. 닫힐 때는 지금처럼 바로 사라집니다. CSS `@keyframes` 로 `opacity` · `scale` · `translate` 만 움직여 JS 상태 · 타이머가 없습니다.

| 대상 | 효과 | 시간 |
| --- | --- | ---: |
| 확인 창 · 비밀번호 발급 창 · 라이트박스 | 배경 Fade + 카드 · 이미지 Scale 0.95 → 1 | 200ms |
| 사용자 메뉴 | 4px 위로 올라오며 Fade | 150ms |
| 모바일 드로어 | 왼쪽 밖에서 밀려 들어옴 | 150ms |
| 드래그 오버레이 · 오류 배너 · 복사 알림 | Fade | 150ms |

곡선은 기존 `--ease-out-quint` 하나입니다.

## 변경 전후 (정지 프레임)

열자마자 CDP `Animation.setPlaybackRate(0)` 로 애니메이션을 묶고 **진입 15ms 시점**으로 맞춰 찍었습니다. 전에는 애니메이션이 없어 완성 상태가 찍히고, 후에는 들어오는 중간 상태(반투명 · 축소 · 밀려 들어오는 중)가 찍힙니다. 빨간 박스가 애니메이션 대상 요소입니다. 드로어 박스는 묶인 순간의 위치라 화면 왼쪽 밖에 걸쳐 있습니다.

<details><summary>데스크톱 1440 × 900 (6장면)</summary>

| 장면 | 전 | 후 |
| --- | --- | --- |
| 대화 삭제 확인 창 | ![대화 삭제 확인 창 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/desktop-confirm.webp) | ![대화 삭제 확인 창 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/desktop-confirm.webp) |
| 비밀번호 발급 창 · 복사 알림 | ![비밀번호 발급 창 · 복사 알림 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/desktop-password.webp) | ![비밀번호 발급 창 · 복사 알림 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/desktop-password.webp) |
| 이미지 라이트박스 | ![이미지 라이트박스 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/desktop-lightbox.webp) | ![이미지 라이트박스 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/desktop-lightbox.webp) |
| 사용자 메뉴 | ![사용자 메뉴 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/desktop-menu.webp) | ![사용자 메뉴 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/desktop-menu.webp) |
| 드래그 오버레이 | ![드래그 오버레이 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/desktop-drop.webp) | ![드래그 오버레이 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/desktop-drop.webp) |
| 관리 화면 오류 배너 | ![관리 화면 오류 배너 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/desktop-banner.webp) | ![관리 화면 오류 배너 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/desktop-banner.webp) |

</details>

<details><summary>모바일 390 × 844 (7장면)</summary>

| 장면 | 전 | 후 |
| --- | --- | --- |
| 대화 삭제 확인 창 | ![대화 삭제 확인 창 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/mobile-confirm.webp) | ![대화 삭제 확인 창 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/mobile-confirm.webp) |
| 비밀번호 발급 창 · 복사 알림 | ![비밀번호 발급 창 · 복사 알림 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/mobile-password.webp) | ![비밀번호 발급 창 · 복사 알림 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/mobile-password.webp) |
| 이미지 라이트박스 | ![이미지 라이트박스 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/mobile-lightbox.webp) | ![이미지 라이트박스 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/mobile-lightbox.webp) |
| 모바일 대화 목록 드로어 | ![모바일 대화 목록 드로어 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/mobile-drawer.webp) | ![모바일 대화 목록 드로어 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/mobile-drawer.webp) |
| 사용자 메뉴 | ![사용자 메뉴 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/mobile-menu.webp) | ![사용자 메뉴 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/mobile-menu.webp) |
| 드래그 오버레이 | ![드래그 오버레이 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/mobile-drop.webp) | ![드래그 오버레이 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/mobile-drop.webp) |
| 관리 화면 오류 배너 | ![관리 화면 오류 배너 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/before/mobile-banner.webp) | ![관리 화면 오류 배너 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/730/evidence/after/mobile-banner.webp) |

</details>

## 성능 — 응답 · 렌더 속도

목업 백엔드 + 전후 빌드, 같은 동작을 15회씩 측정해 중앙값을 냈습니다. 열기 직전부터 400ms 뒤까지 `Performance.getMetrics` 의 차이입니다. 원자료는 `before/probe.json` · `after/probe.json` 입니다.

| 장면 | 화면에 붙기까지 (ms) 전 → 후 | Layout 횟수 | Layout 시간 (ms) | 메인 스레드 작업 (ms) |
| --- | ---: | ---: | ---: | ---: |
| 확인 창 (1440) | 31 → 35 | 2 → **3** | 2.76 → 2.96 | 27.0 → 33.5 |
| 확인 창 (390) | 16 → 14 | 1 → **2** | 2.46 → 2.43 | 15.9 → 16.5 |
| 비밀번호 복사 알림 (1440) | 18 → 23 | 1 → **2** | 0.84 → 0.93 | 8.6 → 10.7 |
| 사용자 메뉴 (1440) | 49 → 51 | 1 → 1 | 0.46 → 0.51 | 27.4 → 33.5 |
| 드로어 (390) | 62 → 59 | 3 → **4** | 11.67 → 11.40 | 36.5 → 38.3 |
| 라이트박스 (1440) | 25 → 24 | 3 → 3 | 0.41 → 0.47 | 10.4 → 13.9 |
| 드래그 오버레이 (1440) | 22 → 24 | 2 → 2 | 4.09 → 3.72 | 23.7 → 27.1 |

- **화면에 붙기까지 걸리는 시간은 그대로입니다**(±5ms 는 측정 잡음, 최솟값도 같은 범위). 애니메이션이 내용 표시를 늦추지 않습니다
- Layout 이 3장면에서 1회 늘었습니다(15회 모두 같아 잡음은 아님). 다만 늘어난 **레이아웃 시간은 0.2ms 이하**입니다
- 메인 스레드 작업이 400ms 동안 +1~7ms 늘었습니다. 대부분 애니메이션 프레임의 스타일 재계산이고, 50ms 를 넘는 긴 작업은 없습니다
- 채팅 스트리밍 경로(`MessageList` · `useChat`)는 바꾸지 않아 답변 응답 시간과는 무관합니다
- CSS 번들 +484B(gzip +132B)

## 동작 확인

| 항목 | 결과 |
| --- | --- |
| 확인 창을 연 지 30ms 뒤 「취소」 클릭 (1440 · 390) | 닫힘 |
| 드로어를 연 지 30ms 뒤 Esc (390) | 닫힘 |
| `prefers-reduced-motion: reduce` 에서 열린 직후 남은 애니메이션 | 0개 (전역 1ms 규칙) |

## 변경 파일

- `frontend/src/index.css` — `--animate-*` 토큰 다섯과 `@keyframes` 넷
- `ConfirmModal.tsx` · `AdminUsersPage.tsx`(발급 창 · 복사 알림) · `Sidebar.tsx`(사용자 메뉴) · `ChatPage.tsx`(MobileDrawer) · `ImageLightbox.tsx` · `Composer.tsx`(드래그 오버레이) · `AdminErrorBanners.tsx` — className 만 추가. 복사 알림은 `role=status` 그릇을 두고 안쪽 글만 `key` 로 바꿔 끼웁니다(#484)
- `docs/02_architecture/design-system.md` §4 진입 애니메이션 규칙 · `CHANGELOG`

## 검증

- `npm run lint` · `npm test`(37파일 426건) · `npm run build` 통과
- 독립 코드 리뷰 APPROVE — 문서의 항목 수(6 → 8곳)만 지적되어 반영
- 측정 하네스 `.issue/730/evidence/e730.mjs`

## 남은 이슈

- 완료 기준의 「Layout 이 늘지 않는다」는 3장면에서 1회씩 늘어 **글자 그대로는 충족하지 못했습니다**. 시간으로는 0.2ms 이하라 체감 영향은 없다고 판단했고, 이 판단을 design-system §4 와 CHANGELOG 에 적었습니다
- 드래그 오버레이는 `backdrop-blur-sm` 과 Fade 가 같은 요소에 있어, 저사양 GPU 에서 150ms 동안 블러 합성이 매 프레임 일어날 수 있습니다(이 환경에서는 측정 차이 없음)
