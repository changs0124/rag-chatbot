## 작업 요약

모바일 헤더의 D 마크(`Logo variant="mark"`)를 뺐습니다. 로고는 드로어를 열었을 때 사이드바 상단에만 나옵니다.
마크를 숨기는 데 쓰던 `Logo` 의 `decorative` 속성은 쓰는 곳이 없어져 함께 지웠고, `variant="mark"` 는 파비콘 벡터 정본이라 남겼습니다.

## 결정 (10-08 확인)

- **드로어가 닫힌 동안 화면에 브랜드 이름이 남지 않는 것은 받아들인다.** 채팅 화면에 브랜드 이름이 꼭 있어야 할 근거가 없음. 문서 제목(「RAG 챗봇」)은 그대로. `design-system.md` 7-3 에 기록
- `decorative` 는 지운다(유일한 호출부가 사라짐)

## 변경 전후 (390x844)

| 전 | 후 |
| --- | --- |
| ![모바일 헤더 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/235/evidence/before/mobile-390-header.webp) | ![모바일 헤더 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/235/evidence/after/mobile-390-header.webp) |
| ![드로어 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/235/evidence/before/mobile-390-drawer.webp) | ![드로어 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/235/evidence/after/mobile-390-drawer.webp) |

빨간 박스가 변경을 볼 자리입니다. 헤더에서 메뉴 버튼과 제목 사이의 마크가 사라져 제목이 그만큼 길게 보이고, 드로어 안 사이드바 로고는 그대로입니다.

<details>
<summary>데스크톱 1440x900 — 바뀌지 않음</summary>

| 전 | 후 |
| --- | --- |
| ![데스크톱 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/235/evidence/before/desktop-1440.webp) | ![데스크톱 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/235/evidence/after/desktop-1440.webp) |

두 webp 파일이 바이트 단위로 같습니다.
</details>

## 모바일 점검 (360 · 390 · 430)

방법 : 빌드 산출물 + `/api` 목업(같은 출처, 긴 대화 제목 · 이미지 첨부 · 문서 그림 · 출처 2건 · 긴 파일명/이메일) → 헤드리스 Chromium, DPR 2.

| 화면 | 확인한 것 | 결과 |
| --- | --- | --- |
| `/login` | 로고 `h-8` · 입력 · 버튼 · 안내문 | 문제 없음 |
| `/` 헤더 | 메뉴 · 제목 말줄임 · 새 채팅 | 문제 없음(마크 제거 뒤 제목 폭이 넓어짐) |
| `/` 드로어 | 열기 · 배경 눌러 닫기 · 로고 · 목록 말줄임 | 문제 없음 |
| `/` 메시지 | 사용자 카드 + 첨부 · 답변 · 문서 그림 · 출처 · 입력창 | 문제 없음. 끝까지 스크롤하면 출처가 입력창에 가리지 않음(360 에서 확인) |
| 확대 보기 | 이미지 눌러 열기 · 내려받기/닫기 버튼 배치 | 문제 없음(버튼은 누르지 않음) |
| `/me` | 이름 · 비밀번호 · 관리 링크 | 문제 없음 |
| `/admin` | 업로드 영역 · 문서 3건(상태별) · 계정 추가 · 사용자 목록 | 문제 없음. 긴 파일명 · 이메일은 말줄임 |

세 폭 모두 가로 스크롤(`scrollWidth > clientWidth`) 없음. **바로 고칠 것 · 따로 뺄 이슈 모두 없음.**
실기기 동작(가상 키보드 · iOS 입력 확대, #221)은 헤드리스로 재현되지 않아 이 점검 범위 밖입니다. 결과는 `frontend.md` 「화면 골격」에도 남겼습니다.

## 변경 파일

- `frontend/src/pages/ChatPage.tsx` — 헤더 마크 · 근거 주석 · `Logo` import 삭제
- `frontend/src/components/Logo.tsx` — `decorative` 삭제, useId 주석을 데스크톱/드로어 사이드바 기준으로
- `frontend/src/pages/ChatPage.test.tsx` — 헤더 마크 2건 → 「헤더에 로고 없음」 · 「드로어를 열면 사이드바 로고가 하나 더」 2건
- `docs/02_architecture/design-system.md` · `frontend.md` · `docs/04_tasks/current-sprint.md` · `CHANGELOG.md`

## 검증

- `npm run lint` · `npm run build` 통과, `vitest` 140/140(케이스 수 그대로 → `case-floors.env` 변경 없음)
- 새 첫 케이스는 변경 전 코드에서 실패함(닫힘 상태 헤더에 「디인사이트」 이미지가 있었음)
- `check-doc-refs` · `check-doc-sections` · `check-doc-versions` · `check-merge-markers` 통과

## 남은 이슈

- 없음
