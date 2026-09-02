# 디자인 시스템

| 항목 | 내용 |
|------|------|
| 프로젝트 | rag-chatbot |
| 문서 버전 | v1.0 |
| 최종 수정일 | 2026-08-18 |
| 작성자 | changs0124 |
| 상태 | `반영됨` (2026-08-18 구현) |

---

> **목표** — 전 화면(채팅 · 로그인 · 마이페이지)을 **Claude 계열 웜 톤**으로 다시 칠하고,
> 레이아웃 구조는 ChatGPT · Claude 채팅 앱을 따른다. 모바일까지 함께 정한다.
> 생성 근거는 `supanova-premium-aesthetic` 스킬이며, **랜딩페이지 전제 규칙은 골라서 버린다**(§6).

## 1. 색 — 토큰으로만 쓴다

웜 크림 계열이다. 회색(zinc)을 그대로 쓰지 않는다 — 대화가 길어지는 화면에서 순백/순회색은 눈이 빨리 지친다.

### 라이트

| 토큰 | 값 | 쓰임 |
|------|-----|------|
| `canvas` | `#FAF9F5` | 화면 바탕 |
| `surface` | `#F0EEE6` | 사이드바 · 가라앉은 면 |
| `raised` | `#FFFFFF` | 카드 · 모달 · 입력창 |
| `line` | `#E4E1D7` | 실선 구분 |
| `ink` | `#1F1E1B` | 본문 |
| `ink-muted` | `#6B6862` | 보조 텍스트 |
| `accent` | `#C96442` | 강조 · 활성 · 주요 버튼 (테라코타) |
| `accent-ink` | `#FFFFFF` | accent 위 글자 |
| `accent-soft` | `#F3E3DB` | 활성 항목 배경 |
| `danger` | `#B4453A` | 삭제 · 오류 |

### 다크

| 토큰 | 값 |
|------|-----|
| `canvas` | `#1F1E1D` |
| `surface` | `#262522` |
| `raised` | `#2F2D2A` |
| `line` | `#3A3835` |
| `ink` | `#F5F4EF` |
| `ink-muted` | `#A8A49C` |
| `accent` | `#D97757` |
| `accent-ink` | `#231C18` |
| `accent-soft` | `#3A2B24` |
| `danger` | `#E0705F` |

### 쓰는 방법 (중요)

토큰은 `index.css` 의 `:root` · `[data-theme="dark"]` 에 CSS 변수로 두고, Tailwind 4 의 `@theme` 이
그 변수를 가리키게 한다. 그래서 **색에는 `dark:` 접두를 쓰지 않는다** — `bg-surface` 한 번이면 두 테마가 다 된다.

```
bg-canvas · bg-surface · bg-raised · text-ink · text-ink-muted · border-line · bg-accent · text-accent
```

`dark:` 는 색이 아닌 것(그림자 세기, 반투명 겹침 등)에만 남긴다.
지금 코드의 `bg-white dark:bg-zinc-950` 짝은 전부 토큰 한 개로 접힌다.

## 2. 타이포

- **본문 서체** : Pretendard Variable (npm 패키지로 번들에 넣는다 — CDN 을 새로 물리지 않는다).
  받지 못하는 환경을 위해 시스템 스택을 뒤에 둔다.
- **금지** : `Noto Sans KR` · `Malgun Gothic` 을 **선순위로** 지정하지 않는다. 자소 간격이 넓어 화면이 헐거워 보인다.
- **크기** : 본문 15px / 보조 13px / 화면 제목 20px. 채팅 본문은 14px 보다 작게 두지 않는다.
- **한국어 규칙**
  - 모든 한국어 블록에 `break-keep` — 조사 앞에서 줄이 갈리면 읽는 속도가 눈에 띄게 떨어진다
  - 본문 `leading-relaxed`, 제목 `leading-snug`. 한국어는 라틴보다 행간이 더 필요하다

## 3. 형태 · 그림자

| 항목 | 값 | 비고 |
|------|-----|------|
| 라운드(카드·모달) | `rounded-2xl` (16px) | |
| 라운드(입력창) | `rounded-3xl` (24px) | 두 제품 모두 알약에 가깝다 |
| 라운드(버튼) | `rounded-xl`, 주요 CTA 는 `rounded-full` | |
| 그림자 | `0 1px 2px rgba(0,0,0,.04), 0 8px 24px -12px rgba(0,0,0,.10)` | 확산형만. 짙은 `shadow-md` 금지 |
| 구분선 | `border-line` 1px | 필요한 곳에만. 면 색 차이로 구분되면 선을 넣지 않는다 |

## 4. 모션

- **이징 한 가지** : `cubic-bezier(0.16, 1, 0.3, 1)` — `--ease-out-quint` 로 두고 전 컴포넌트가 쓴다.
  `linear` · `ease-in-out` 금지.
- **지속** : 상태 변화 150ms · 진입 240ms · 모달 200ms
- **속성** : `transform` · `opacity` · `background-color` 만. 레이아웃을 흔드는 속성에 트랜지션을 걸지 않는다
- **누르는 느낌** : 버튼 `hover:scale-[1.02]` / `active:scale-[0.98]`
- **끄는 중에는 트랜지션을 끈다** : 사이드바 폭 드래그처럼 값이 매 프레임 바뀌는 동작에 트랜지션이 걸리면
  손가락보다 늦게 따라와 고무줄처럼 보인다
- **`prefers-reduced-motion: reduce` 를 존중한다** : 모든 트랜지션·애니메이션을 1ms 로 줄인다

## 5. 컴포넌트 규칙

- **말풍선은 사용자 쪽에만 둔다.** ChatGPT · Claude 모두 답변에는 배경을 깔지 않는다 —
  답변이 길 때 큰 색면이 화면을 갈라 읽기 흐름을 끊는다. 사용자 메시지만 `raised` 카드로 오른쪽 정렬한다.
- **입력창은 떠 있는 판이다.** `raised` + 확산 그림자 + `rounded-3xl`. 포커스면 `accent` 링을 얇게 두른다.
- **스크롤 페이드** : 메시지 영역 하단에 `canvas` 로 가는 그라데이션을 깔아 입력창 뒤로 글이 사라지게 한다.
- **활성 대화** : `accent-soft` 배경 + `accent` 글자. 선을 두르지 않는다.
- **이중 테두리(double-bezel)는 모달과 로그인 폼에만** 쓴다. 대화 버블·첨부 카드에는 과하다.
- **아이콘** : 지금의 자체 SVG 세트(`frontend/src/components/icons.tsx`)를 계속 쓴다. 굵기 1.8 유지.

## 6. supanova 스킬에서 **버린** 규칙과 사유

랜딩페이지를 전제로 한 규칙이라 채팅 앱에 그대로 넣으면 해가 된다.

| 스킬 규칙 | 처리 | 사유 |
|-----------|------|------|
| 섹션 여백 `py-24~40` | 버림 | 채팅은 밀도가 생명이다. 한 화면에 대화가 몇 턴 들어가는지가 사용성을 좌우한다 |
| 스크롤 진입 애니메이션(IntersectionObserver) | 버림 | 스트리밍 중 매 토큰마다 리렌더가 도는 목록이다. 진입 애니메이션과 자동 스크롤이 서로를 방해한다 |
| 떠다니는 그라데이션 오브 · 마퀴 · 회전 그라데이션 | 버림 | 상시 애니메이션은 배터리를 먹고 글 읽기를 방해한다 |
| 유리 플로팅 내비 | 버림 | 앱 셸에는 상주 사이드바가 맞다. 두 제품 모두 그렇다 |
| Iconify Solar CDN | 버림 | 외부 스크립트를 늘리지 않는다. 자체 SVG 로 충분하다 |
| 마케팅 카피 · 가짜 지표/후기 | 버림 | 실제 제품 화면이다. 없는 숫자를 적지 않는다 |
| Warm Editorial 팔레트 | **채택** | 목표 톤과 정확히 겹친다 |
| 종이 질감(노이즈 오버레이) | 버림 | 웜 크림 면만으로 충분히 따뜻하다. 고정 오버레이를 한 겹 더 얹을 이유가 없다 |
| 이징 시그니처 · 누름 물리감 | **채택** | §4 |
| 이중 테두리 카드 · 알약 CTA | **부분 채택** | 모달 · 첨부 카드 · 주요 버튼에만 |
| 한국어 타이포 규칙(`break-keep`, 행간) | **채택** | §2 |
| 모바일 붕괴 규칙 · `100dvh` | **채택** | §7 |

## 7. 모바일

- 높이는 `h-screen` 이 아니라 **`100dvh`** — iOS 주소창이 접힐 때 입력창이 화면 밖으로 밀리는 것을 막는다
- 입력창 하단에 `env(safe-area-inset-bottom)` 만큼 여백을 준다(홈 인디케이터 겹침 방지)
- 터치 대상은 최소 44×44px. 헤더 아이콘 버튼·입력 필드·주요 버튼이 모두 이 높이를 지킨다
- 사이드바는 `md` 미만에서 드로어다. 폭 `min(84vw, 320px)`, 배경은 `backdrop-blur` + 반투명 검정
- 드로어가 열린 동안 뒤 화면은 스크롤되지 않게 잠근다

## 7-2. 파비콘 · 앱 아이콘

모티프는 **말풍선 + 문서 + 출처 링크** 다. 세 요소가 이 제품의 정의(문서에서 찾아 출처를 밝히는 대화)와 겹친다.
색은 §1 의 `canvas` · `accent` 를 그대로 쓴다.

| 파일 | 쓰임 |
|------|------|
| `frontend/public/favicon-source.png` | 512px 원본. 다른 크기는 여기서 파생시킨다 |
| `frontend/public/favicon.ico` | 16 · 32 · 48px 묶음 (탭) |
| `frontend/public/favicon-32.png` | 32px PNG |
| `frontend/public/apple-touch-icon.png` | 180px (iOS 홈 화면) |

`frontend/index.html` 이 세 파일을 가리키고, 주소창 색(`theme-color`)은 라이트·다크 각각 `canvas` 값과 같다.
32px 로 줄이면 링크 배지는 뭉개지고 **말풍선 + 문서 실루엣만 남는다** — 그 상태에서도 구분되는 것을 채택 기준으로 삼았다.

## 8. 적용 결과

| 대상 | 상태 |
|------|------|
| `frontend/src/index.css` | 토큰 · `@theme inline` · Pretendard · 이징 · reduced-motion 규칙 |
| `frontend/src/components/TextInput.tsx` · `ConfirmModal.tsx` · `ProtectedRoute.tsx` | 토큰 · 44px 터치 높이 · 이중 테두리 모달 |
| `frontend/src/components/chat/Sidebar.tsx` | 토큰 · 시간 묶음(오늘/지난 7일/이전) · 활성 항목 `accent-soft` |
| `frontend/src/components/chat/ResizableSidebar.tsx` | 신규 — 폭 조절(FEAT-UI-001) |
| `frontend/src/pages/ChatPage.tsx` | `100dvh` · 드로어 blur + 스크롤 잠금 · 스크롤 페이드 |
| `frontend/src/components/chat/MessageList.tsx` | 답변 버블 제거 · 사용자만 `raised` 카드 |
| `frontend/src/components/chat/Composer.tsx` · `Citations.tsx` | 떠 있는 입력 판 · safe-area · 토큰 |
| `frontend/src/pages/LoginPage.tsx` · `MyPage.tsx` | Editorial Split · 카드 + 세그먼트 컨트롤 |
| `frontend/src/components/chat/CameraCapture.tsx` | 껍데기·버튼은 토큰, 안쪽 미리보기만 검정(영상이 주인공) |
| `frontend/src/components/ErrorBoundary.tsx` | 토큰 · `100dvh` · accent 알약 버튼 |
| `frontend/index.html` · `frontend/public/` | 파비콘 3종 · `theme-color` · `lang="ko"`(문서는 한국어인데 `en` 으로 선언돼 있었음) |

화면 코드에 남은 `zinc-*` 색은 0건이다. 화면별 배치와 폭 조절 규격은 구현이 정본이며,
기능 단위 명세는 `docs/01_specs/features.md` 에 있다.
