## 작업 요약

화면의 이모지·장식 기호를 `icons.tsx` 의 무채색 라인 아이콘으로 바꿨습니다. 글자는 그대로 두고 아이콘은 `aria-hidden` 입니다.
이슈는 `⚠` 만 적었지만 관리자 문서 상태 라벨 `● 완료` `◐ 처리중` `⚠ 실패` 가 한 묶음이라 **셋을 함께** 바꿨습니다.
재유입은 테스트(`src/no-emoji.test.ts`)로 막습니다. 커밋 `45d35ef` · 브랜치 `feat/192-line-icons` (#190 색 반영된 main 기준)

| 자리 | 전 | 후 |
| --- | --- | --- |
| 채팅 문서 첨부 칩 | `📄 문서` | 문서 아이콘 + 문서 |
| 마이페이지 뒤로가기 · 문서 관리 | `← 채팅으로` · `📄 문서 관리` · `→` | 왼쪽 꺾쇠 · 문서 아이콘 · 오른쪽 꺾쇠 |
| 관리자 뒤로가기 | `← 마이페이지` | 왼쪽 꺾쇠 |
| 관리자 문서 상태 | `● 완료` `◐ 처리중` `⚠ 실패` | 체크 · 시계 · 느낌표 원 + 글자 (색은 종전 그대로) |

## 모바일 390 확대 비교 (왼쪽 = 전, 오른쪽 = 후)

| 관리자 | 마이페이지 |
| --- | --- |
| ![관리자 모바일 비교](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/192/evidence/after/cmp-admin-mobile.webp) | ![마이페이지 모바일 비교](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/192/evidence/after/cmp-mypage-mobile.webp) |

<details>
<summary>데스크톱 1440 전체 (관리자 · 마이페이지 · 채팅)</summary>

| 전 | 후 |
| --- | --- |
| ![관리자 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/192/evidence/before/admin.webp) | ![관리자 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/192/evidence/after/admin.webp) |
| ![마이페이지 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/192/evidence/before/mypage.webp) | ![마이페이지 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/192/evidence/after/mypage.webp) |
| ![채팅 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/192/evidence/before/chat.webp) | ![채팅 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/192/evidence/after/chat.webp) |

박스 : 관리자 「실패」 상태 · 마이페이지 문서 관리 링크 · 채팅 문서 첨부 칩

</details>

## 검증

- `oxlint` · `vite build` · vitest **115/115** · 케이스 하한 114 → **115** · `check-all.sh docs` 통과
- 가드 실효성 : `← 채팅으로` 를 일부러 되살려 `no-emoji.test.ts` 가 **실패하는 것을 확인**한 뒤 되돌림
- 이모지 검사 범위 : 화면 코드(.ts/.tsx, 테스트·셋업 제외)에서 주석을 지운 뒤 U+2190–21FF · 2300–23FF · 25A0–25FF · 2600–27BF · 2B00–2BFF · 1F300–1FAFF

## 남은 이슈

- 모바일 터치 영역(뒤로가기 링크 높이 16px 등)은 #198 에서 다룹니다 — 이 이슈는 모양만 바꿨습니다
