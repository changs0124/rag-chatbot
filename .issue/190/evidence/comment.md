## 작업 요약

색 토큰을 회사 홈페이지(dinsight.kr) 체계로 맞췄습니다. **토큰 이름과 화면 코드는 그대로 두고 값만** 바꿨습니다(화면 코드 변경 0줄).
원칙도 홈페이지를 따릅니다 — 면은 무채색이고 브랜드 시안은 버튼·링크·활성 표시에만 씁니다. 「자료 없음」 배지는 사용자 결정으로 무채색이 됐습니다.
구현 커밋 `d1fe8bd` · 브랜치 `feat/190-homepage-color-tokens` (#191 브랜치 위에서 시작 — #194 머지 후 main 으로 리베이스해 PR 예정)

## 대응표

| 토큰 | 전 | 후 | 홈페이지 출처 |
| --- | --- | --- | --- |
| accent | `#0070B5` | `#08719B` | `--brand-deep` (버튼·링크) |
| ink / ink-muted | `#2A2F33` / `#666E76` | `#283139` / `#4A545F` | `text-dark` / `dark-light` |
| canvas / surface | `#F7F9FB` / `#EDF1F5` | `#FBFCFE` / `#EDF2F8` | 바탕 그라데이션 |
| line | `#CDD3DA` | `#D0D2D3` | 잉크 22% 헤어라인 합성 |
| accent-soft | `#E1F1FA` | `#E8F7FC` | 브랜드 시안 12% 합성 |
| highlight | `#F2931D` (오렌지) | `#E2E7ED` | 무채색 (사용자 결정) |
| danger 계열 | 그대로 | 그대로 | 대응 없음 — 대비만 재측정 |

## 변경 전후 — 데스크톱 1440x900

| 전 | 후 |
| --- | --- |
| ![로그인 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/before/login.webp) | ![로그인 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/login.webp) |
| ![채팅 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/before/chat.webp) | ![채팅 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/chat.webp) |

- 로그인 : 박스가 주요 버튼입니다. `#0070B5` → `#08719B` (홈페이지 버튼과 같은 색)
- 채팅 : 박스가 「자료 없음」 배지입니다. 오렌지 → 무채색. 사이드바 활성 대화·출처 번호·본문 잉크도 함께 바뀌었습니다

<details>
<summary>마이페이지 · 관리자 (데스크톱)</summary>

| 전 | 후 |
| --- | --- |
| ![마이페이지 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/before/mypage.webp) | ![마이페이지 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/mypage.webp) |
| ![관리자 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/before/admin.webp) | ![관리자 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/admin.webp) |

박스 : 마이페이지 저장 버튼 · 관리자 문서 상태(실패 = danger, 값 그대로)

</details>

<details>
<summary>모바일 390x844 (사용자 추가 요청)</summary>

| 전 | 후 |
| --- | --- |
| ![채팅 모바일 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/before/chat-mobile.webp) | ![채팅 모바일 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/chat-mobile.webp) |
| ![마이페이지 모바일 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/before/mypage-mobile.webp) | ![마이페이지 모바일 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/mypage-mobile.webp) |

</details>

## 대비 (WCAG 2.1, 계산값)

| 쌍 | 전 | 후 | 기준 |
| --- | ---: | ---: | ---: |
| 본문 / 바탕 | 12.81 | **12.88** | 4.5 |
| 보조 / 사이드바 | 4.56 | **6.85** | 4.5 |
| 버튼 글자 / 버튼 | 5.27 | **5.46** | 4.5 |
| 활성 대화 글자 / 배경 | 4.56 | **4.98** | 4.5 |
| accent 아이콘 / 사이드바 | 4.64 | **4.85** | 4.5 |
| 자료없음 글자 / 배지 | 5.77 | **10.63** | 4.5 |
| 오류 글자 / 오류 배경 | 4.64 | 4.64 | 4.5 |
| 첨부 실패 아이콘 / 스크림 | 4.43 | **8.34** | 3.0 |

악화된 쌍은 없습니다. 가장 빡빡한 쌍은 「accent 아이콘 / 사이드바」 4.85 입니다.

## 변경 파일

- `frontend/src/index.css` — 토큰 값 · 출처 주석 / `frontend/index.html` — `theme-color` / `chat/Composer.tsx` — 주석의 수치만
- `docs/02_architecture/design-system.md`(v2.1 · 대응표 · 대비표) · `frontend.md` · CHANGELOG

## 검증

- `oxlint` · `vite build` · vitest **114/114** · `check-all.sh docs` 통과
- 캡처 : 빌드 + 목업 API, 데스크톱 1440x900 · 모바일 390x844(DPR 2)

## 남은 이슈

- 서체(홈페이지 Wanted Sans / 앱 Pretendard)와 조판(카드 헤어라인 · 그림자 제거)은 이 이슈 범위 밖입니다
- 홈페이지가 색을 바꾸면 이 앱은 따라가지 않습니다 — 대응 관계는 design-system.md 에 적었습니다
