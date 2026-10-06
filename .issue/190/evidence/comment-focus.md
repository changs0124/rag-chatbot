## 추가 — 포커스 색 (사용자 추가 요청)

포커스 표시도 홈페이지 규칙으로 맞췄습니다. 커밋 `96f19f0`

| 자리 | 전 | 후 | 홈페이지 대응 |
| --- | --- | --- | --- |
| 입력칸(로그인·설정 · 채팅 입력창 · 대화 제목 편집) | 테두리 `#0070B5` + 링 `#E1F1FA` 3px | 테두리 **`#08719B`** + 시안 15% 링 **4px** | `.field` 의 `focus:border-primary-deep focus:ring-4 focus:ring-primary/15` |
| 버튼 · 링크 (키보드 Tab) | **브라우저 기본 링**(검정·파랑 이중선) | **2px `#08719B` 외곽선** | `:focus-visible` 의 `outline-2 outline-primary-deep` |

확대 비교 (위 = 전, 아래 = 후)

| 키보드 포커스 — 저장 버튼 | 입력칸 포커스 — 이메일 |
| --- | --- |
| ![버튼 포커스 확대](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/cmp-focus-button.webp) | ![입력칸 포커스 확대](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/cmp-focus-input.webp) |

<details>
<summary>전체 화면 (데스크톱 3 · 모바일 1)</summary>

| 전 | 후 |
| --- | --- |
| ![입력칸 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/before/focus-input.webp) | ![입력칸 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/focus-input.webp) |
| ![채팅 입력창 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/before/focus-composer.webp) | ![채팅 입력창 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/focus-composer.webp) |
| ![버튼 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/before/focus-button.webp) | ![버튼 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/focus-button.webp) |
| ![입력칸 모바일 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/before/focus-input-mobile.webp) | ![입력칸 모바일 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/190/evidence/after/focus-input-mobile.webp) |

</details>

- 「전」은 #190 이전 빌드(= 지금 운영 화면)입니다
- 외곽선 `#08719B` 는 바탕 5.32 · 사이드바 4.85 로 비텍스트 기준 3.0 을 넘습니다
- 전역 `:focus-visible` 은 `@layer base` 에 두어 입력칸의 `outline-none` 이 이깁니다 — 입력칸에 외곽선이 겹치지 않습니다
- 입력칸 링은 홈페이지처럼 옅습니다(시안 15%). 포커스 위치는 테두리 색이 알려 줍니다
- 검증 : `oxlint` · `vite build` · vitest 114/114 · `check-all.sh docs` 통과
