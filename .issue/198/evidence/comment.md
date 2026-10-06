## 작업 요약

모바일(360·390)에서 누르기 어려운 곳과 공간을 낭비하던 배치를 고쳤습니다. **모든 변경은 md 미만에서만** 적용되고, 데스크톱 값은 `md:` 로 고정했습니다.
커밋 `a46d8e4` · 브랜치 `feat/198-mobile-layout`

## 측정 (360px, 측정 스크립트)

| 항목 | 전 | 후 |
| --- | ---: | ---: |
| 44px 미만 터치 대상 | **15곳** | **0곳** |
| 로그인 입력칸 폭 | 268px | **304px** |
| 로그인 버튼 하단 (360x640) | 638px (화면 끝) | **565px** |
| 가로 넘침 | 0 | 0 |
| 데스크톱 1440 로그인·마이페이지·관리자 | — | **픽셀 동일** (다른 채널 0) |

원본 : [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/before/audit.txt) · [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/after/audit.txt)

| 고친 곳 | 전 | 후 |
| --- | --- | --- |
| 뒤로가기(마이페이지·관리자) | 68x20 | 44 높이, 글자 위치 유지 |
| 대화 항목 · 삭제 ✕ · 새 대화 | 36 · 24x24 · 40 | 44 · 44x44 · 44 |
| 입력창 첨부·보내기 | 40x40 | 44x44 |
| 관리자 「삭제」·「비밀번호 초기화」 | 28, 혼자 한 줄 | 44, 같은 줄 오른쪽 |
| 로그인 | 이중 프레임 · 여백 큼 | 모바일은 카드 하나 · 여백 축소 |
| 「자료 없음」 배지 | 11px | 12px |

## 모바일 360 전후 (왼쪽 = 전)

| 로그인 | 관리자 |
| --- | --- |
| ![로그인](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/after/cmp-login-360.webp) | ![관리자](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/after/cmp-admin-360.webp) |

<details>
<summary>대화 목록 · 마이페이지 · 채팅 (360)</summary>

| 대화 목록 | 마이페이지 | 채팅 |
| --- | --- | --- |
| ![드로어](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/after/cmp-drawer-360.webp) | ![마이페이지](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/after/cmp-mypage-360.webp) | ![채팅](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/after/cmp-chat-360.webp) |

</details>

<details>
<summary>390 · 데스크톱 1440 (불변 확인용, 박스 없음 — 바뀐 곳이 없어서)</summary>

| 전 | 후 |
| --- | --- |
| ![로그인 390 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/before/login-390.webp) | ![로그인 390 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/after/login-390.webp) |
| ![로그인 1440 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/before/login-1440.webp) | ![로그인 1440 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/after/login-1440.webp) |
| ![관리자 1440 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/before/admin-1440.webp) | ![관리자 1440 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/198/evidence/after/admin-1440.webp) |

</details>

## 검증

- `oxlint` · `vite build` · vitest **115/115** · `check-all.sh docs` 통과
- 문서 : design-system.md §7 「44px 를 지킨다」는 **#198 전에는 사실이 아니었다** — 실측값과 규칙(md 미만만 · 패딩으로 영역 확보)을 적었다

## 남은 이슈

- 없음. 측정 스크립트는 저장소에 넣지 않았다(증거 텍스트로 남김) — 게이트로 만들지는 별도 판단
