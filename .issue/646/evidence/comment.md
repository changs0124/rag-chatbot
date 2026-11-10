## #646 서비스 수준 시각 디자인 개편 — 전후 증거(main 37f5692 위로 merge 한 판)

사용자 승인(11-10, 아티팩트 시안) 그대로 : 버튼 체계 · 반경 `rounded-lg` 통일과 hover scale 제거 · 한 겹 카드(모달 · 로그인 · 임시 비밀번호 창) · 관리 목록 한 장 카드(확장자 타일 · 아바타 · 상태/역할 배지 · 연도 표기) · 스켈레톤 로딩(이력 · 관리 목록) · 답변 준비 중 점 셋 · 사이드바 지금 대화 막대 + 굵기(M5) · 입력칸 `line-strong`(M6) · 모바일 터치 44px(M4) · 「설정」 이름 통일 · Pretendard 유지.

**before = 현재 main(#642~#645 반영)**, after = 이 브랜치. 두 폭 같은 목업 · 같은 29화면.

### 측정

| 지표 | before | after |
|---|---|---|
| 가로 넘침(두 폭 · 29화면) | 0 | 0 |
| 모바일 44px 미만 대상 | 16 (헤더 제목 35 · 메뉴 40 · 확대 보기 36/40 · 확인 창 40 · 첨부 제거 20) | 2 (첨부 제거 — 보이는 원 20px, 누르는 영역 `::after` 모바일 36 · 데스크톱 28, 사용자 승인) |
| 대화를 연 뒤 문서 스크롤 · 헤더 top(#642 회귀 확인) | — | 데스크톱 0 · 0 / 모바일 0 · 0 |

### #644 접근성 회귀 확인(같은 키보드 탐침, after)

- 업로드 칸 Tab 도달 · 포커스 외곽선 2px : 두 폭 ✓
- 모달 3종(확인 · 임시 비밀번호 · 확대 보기) : Tab 이 대화상자와 브라우저 UI(BODY) 사이만 오가고 뒤 화면 요소 0 · 닫으면 연 버튼으로 복귀 ✓
- 모바일 드로어 : 열면 「새 대화」로 포커스 · Esc 로 닫힘 · 햄버거로 복귀 ✓

원자료 : `after/keyboard-probe.json` · `after/scroll.json` · `before/metrics.json` · `after/metrics.json` · 캡처 `cap.mjs` · 탐침 `k646.mjs` · `scroll646.mjs` · 비교 `cmp.py`

### 화면(왼쪽 전 · 오른쪽 후)

| 화면 | 데스크톱 1440×900 | 모바일 390×844 |
|---|---|---|
| 로그인 | ![로그인 데스크톱](compare/desktop-01-login.webp) | ![로그인 모바일](compare/mobile-01-login.webp) |
| 채팅 빈 화면 | ![채팅 빈 화면 데스크톱](compare/desktop-10-chat-empty.webp) | ![채팅 빈 화면 모바일](compare/mobile-10-chat-empty.webp) |
| 드로어 | — | ![드로어 모바일](compare/mobile-11-drawer.webp) |
| 프로필 메뉴 | ![프로필 메뉴 데스크톱](compare/desktop-12-profile-menu.webp) | ![프로필 메뉴 모바일](compare/mobile-12-profile-menu.webp) |
| 대화 | ![대화 데스크톱](compare/desktop-13-thread.webp) | ![대화 모바일](compare/mobile-13-thread.webp) |
| 대화(아래) | ![대화(아래) 데스크톱](compare/desktop-13b-thread-bottom.webp) | ![대화(아래) 모바일](compare/mobile-13b-thread-bottom.webp) |
| 이력 로딩 | ![이력 로딩 데스크톱](compare/desktop-14-loading-history.webp) | ![이력 로딩 모바일](compare/mobile-14-loading-history.webp) |
| 답변 준비 중 | ![답변 준비 중 데스크톱](compare/desktop-15-answer-pending.webp) | ![답변 준비 중 모바일](compare/mobile-15-answer-pending.webp) |
| 첨부 | ![첨부 데스크톱](compare/desktop-16-composer-attach.webp) | ![첨부 모바일](compare/mobile-16-composer-attach.webp) |
| 확대 보기 | ![확대 보기 데스크톱](compare/desktop-17-lightbox.webp) | ![확대 보기 모바일](compare/mobile-17-lightbox.webp) |
| 설정(마이페이지) | ![설정(마이페이지) 데스크톱](compare/desktop-20-mypage.webp) | ![설정(마이페이지) 모바일](compare/mobile-20-mypage.webp) |
| 관리자 · 문서 | ![관리자 · 문서 데스크톱](compare/desktop-30-admin-docs.webp) | ![관리자 · 문서 모바일](compare/mobile-30-admin-docs.webp) |
| 관리자 · 문서 로딩 | ![관리자 · 문서 로딩 데스크톱](compare/desktop-31-admin-docs-loading.webp) | ![관리자 · 문서 로딩 모바일](compare/mobile-31-admin-docs-loading.webp) |
| 관리자 · 사용자 | ![관리자 · 사용자 데스크톱](compare/desktop-32-admin-users.webp) | ![관리자 · 사용자 모바일](compare/mobile-32-admin-users.webp) |
| 확인 모달 | ![확인 모달 데스크톱](compare/desktop-33-confirm-modal.webp) | ![확인 모달 모바일](compare/mobile-33-confirm-modal.webp) |

### 확인

- `npm run lint` · `npx vitest run` 359/359 · `npm run build` · `check-all.sh docs` 통과
- merge 충돌 4파일 : 접근성 · 동작은 main, 시각은 #646 으로 합침
