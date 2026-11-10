## #658 11-10 리뷰 후속 문서 · 주석 정합 — 전후

동작 변경 없음(vitest 359 → 359 · lint · tsc · `check-all.sh docs` 통과). 전후 grep : `before/grep.txt` · `after/grep.txt`

**design-system.md**
- §1 「이 표가 덮지 못하는 것」 : 입력 테두리 1.48 「아직 그대로·미달」 행 제거 → #646 `line-strong`(3.32 · 3.24)으로 해소됐다는 문장(같은 문서 §1 토큰 표 · §5 와 모순 해소)
- 토큰 사용 목록 : 실제 셈 25종(`border-line-strong` · `bg-accent-hover` · `divide-line` · `outline-accent` · `bg-ink-muted` · `border-danger` 추가), 「토큰 14개」 → 16개(두 곳)
- 「쓰임이 적은 4종」 표 : 4종(토큰 수)은 맞음 — 대신 #646 이 늘린 자리(처리중 · 역할 · 실패 배지, 스켈레톤 막대)를 행으로 더함
- `surface`/`canvas` 1.06 → **1.10**(재계산 1.096)
- 버튼 체계 : 「반경은 모두 rounded-lg」 → 글자 버튼에 한정, 아이콘 버튼은 실제 반경(full · xl · lg · md)을 자리별로. §3 라운드 표도 같은 한정
- 로딩 절 : 첨부 업로드 회전 원 · 동기화 아이콘 회전 예외 명시
- 「마이페이지」 2곳 → 「설정」

**낡은 화면 이름 → 「설정」** : README · live-integration · features(3) · api · frontend(2) · 코드 주석 9곳(Sidebar · useChat · useChat.test · BackLink · PageShell · endpoints · limits · AdminUsersPage · ChatPage). 남긴 것 : `frontend.md` 보안 헤더 행의 「마이페이지」(#404/#411 점검 당시 기록) · 파일/라우트 이름 `MyPage` · `/me`

**CHANGELOG · features** : #644 「배경 클릭 닫기도 넣지 않았다」 → 배경 클릭이 없는 건 임시 비밀번호 창뿐(#253)이라고 정정, features.md 모달 패턴 줄도 같게 · #646 「혼재 해소」 → 글자 버튼에 한정, 아이콘 버튼 예외 밝힘

**frontend.md 화면 골격** : 입력줄이 자란다(#643) · 드로어 dialog/Esc/inert(#644) 한 줄씩(정본 design-system.md)

**코드(주석 · 동작 불변)** : Composer 재시도 「카드 아래쪽 절반」 → 실제 `min-h-6`(24px) · AdminDocumentsPage.test jsdom 포커스 단언의 한계 주석 · MyPage `id="new-password-hint"` → `useId`
