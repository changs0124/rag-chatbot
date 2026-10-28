## #541 전후 리포트 — 프론트 죽은 코드 · 중복 정리

구현 커밋 `b3ed940` (브랜치 `fix/541-frontend-dead-code`)

### 바꾼 것
- `Logo.tsx` : `variant="mark"` 분기 제거(호출부 0건, 테스트 포함). 파비콘 벡터 정본은 분기가 아니라 마크 상수 `MARK` · `ORANGE` · `FOLD_STOPS` — `design-system.md` 7-2 · 7-3(락업 표 · 배치 표의 variant 열)을 그에 맞춤
- `types.ts` : `AdminUser` → `type AdminUser = Me`. 「여기서는 이메일이 필요하다」는 `Me` 에도 이메일이 있어 틀린 주석이라 교체(서버 `AdminUserResponse` 의 `createdAt` 은 화면이 안 씀)
- `AdminDocumentsPage` · `AdminUsersPage` 의 같은 오류 배너 블록 → `components/AdminErrorBanners.tsx`
- CHANGELOG [Unreleased] `### Refactored`

### 증거 — 화면 변화 없음
변경 전후 커밋을 각각 빌드해 같은 목업 API(관리자 목록 두 개는 500)로 1280×800 · DPR 2 캡처. **박스 포함 8장 모두 전후 픽셀 차이 0**(Pillow `ImageChops.difference(...).getbbox() == None`).

| 화면 | before | after |
|---|---|---|
| 로그인 로고 | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/541/evidence/before/login.webp) | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/541/evidence/after/login.webp) |
| 사이드바 로고 | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/541/evidence/before/sidebar.webp) | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/541/evidence/after/sidebar.webp) |
| 문서 관리 오류 배너 | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/541/evidence/before/admin-documents.webp) | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/541/evidence/after/admin-documents.webp) |
| 사용자 관리 오류 배너 | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/541/evidence/before/admin-users.webp) | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/541/evidence/after/admin-users.webp) |

### 검증
- `npm run lint`(oxlint) 통과 · `tsc -b` rc=0 · vitest **308/308**(케이스 수 그대로) · `npm run build` 통과
- `scripts/check-all.sh docs` 돌린 검사 전부 통과(shellcheck 는 로컬에 없어 건너뜀 — CI 가 돈다)
