## 작업 요약

테마 전환(라이트·다크·시스템)을 **화면 · API · 컬럼에서 함께** 걷었습니다. 이제 화면은 라이트 하나이고 OS 가 다크여도 라이트로 뜹니다.
`dark:` 가 다시 들어오면 OS 다크 사용자에게만 화면이 갈리므로, 그걸 막는 테스트(`theme-tokens.test.ts`)를 넣었습니다.
구현 커밋 `612973e` · 브랜치 `chore/191-remove-theme-switch`

## 변경 전후 — 데스크톱 1440x900

| 전 | 후 |
| --- | --- |
| ![마이페이지 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/191/evidence/before/mypage.webp) | ![마이페이지 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/191/evidence/after/mypage.webp) |
| ![OS 다크 + 채팅 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/191/evidence/before/os-dark-chat.webp) | ![OS 다크 + 채팅 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/191/evidence/after/os-dark-chat.webp) |

- 1행 : 빨간 박스가 설정 카드 목록입니다. 「테마」 카드(라이트/다크/시스템)가 사라졌습니다.
- 2행 : 브라우저를 OS 다크(`prefers-color-scheme: dark`)로 띄운 같은 화면입니다. 전에는 다크로, 지금은 라이트로 뜹니다. 화면 전체가 바뀌는 변경이라 박스는 생략했습니다.

<details>
<summary>모바일 390x844 (사용자 추가 요청)</summary>

| 전 | 후 |
| --- | --- |
| ![마이페이지 모바일 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/191/evidence/before/mypage-mobile.webp) | ![마이페이지 모바일 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/191/evidence/after/mypage-mobile.webp) |
| ![OS 다크 + 채팅 모바일 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/191/evidence/before/os-dark-chat-mobile.webp) | ![OS 다크 + 채팅 모바일 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/191/evidence/after/os-dark-chat-mobile.webp) |

</details>

## 백엔드

| 항목 | 전 | 후 |
| --- | --- | --- |
| `PATCH /api/profile/theme` | 200 · 잘못된 값 400 | **404** |
| `/api/auth/me` · `/api/profile` 응답 `theme` | 있음 | **없음** (`role` 은 유지) |
| `users.theme` 컬럼 | 있음 | V8 에서 `drop column if exists` |
| 백엔드 테스트 | 231 통과 | **231 통과** — 테마 케이스를 「404 · 키 없음」 케이스로 교체 |

원본 : [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/191/evidence/before/backend-theme-api.txt) · [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/191/evidence/after/backend-theme-api.txt). Flyway 가 빈 DB 에서 V1(컬럼 생성) → V8(삭제)를 실제로 돌린 로그가 들어 있습니다.

## 변경 파일

- 프론트 : `theme/ThemeContext.tsx`·테스트 삭제 · `main.tsx` · `AuthContext.tsx` · `MyPage.tsx` · `types.ts` · `endpoints.ts` · `index.css`(다크 토큰 14개·variant) · `index.html` · `test/setup.ts` · 신규 `theme-tokens.test.ts`
- 백엔드 : `ProfileController` · `ProfileService` · `ProfileDtos` · `AuthDtos` · `AuthService` · `User` · `UserRepository`(+XML) · 생성자 호출 2곳 · 신규 `V8__drop_user_theme.sql`
- 문서 : api · erd · frontend · design-system · overview · CONVENTIONS · README · CHANGELOG · `case-floors.env`

## 검증

- 프론트 : `oxlint` · `vite build` · vitest **114/114**
- 백엔드 : `./mvnw verify` **231/231**
- `check-all.sh docs` · `quick` 통과 (shellcheck 미설치로 셸 정적 분석 1건 건너뜀 — CI 에서 돎)
- 케이스 하한 : 프론트 115 → **114** (지운 4 · 더한 3, 사유는 CHANGELOG), 백엔드 231 유지
- 가드 테스트 실효성 : `MyPage.tsx` 에 `dark:bg-black` 을 일부러 넣어 **실패하는 것을 확인**한 뒤 되돌림

## 남은 이슈

- **운영 VM DB 의 V8 적용은 다음 배포에서 확인합니다.** 로컬은 빈 DB 기준이며, `if exists` 라 재실행해도 안전합니다
- 사용자 브라우저의 `localStorage` 에 `rag_chatbot_theme` 키가 남지만 읽는 코드가 없어 무해합니다(지우는 코드를 따로 넣지 않음)
