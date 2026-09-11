# 디자인 시스템

| 항목 | 내용 |
|------|------|
| 프로젝트 | rag-chatbot |
| 문서 버전 | v2.0 |
| 최종 수정일 | 2026-09-11 |
| 작성자 | changs0124 |
| 상태 | `반영됨` (2026-08-18 구현 · 2026-09-11 회사 CI 반영, #151) |

---

> **목표** — 색은 **회사 CI(디인사이트)에서 파생**시키고, 레이아웃 구조는 ChatGPT · Claude 채팅 앱을
> 따른다. 모바일까지 함께 정한다. 랜딩페이지 전제 규칙은 골라서 버린다(§6).
>
> **v1.0 의 Claude 계열 웜 톤은 폐기했다(#151).** 회사 로고와 무관한 팔레트였고,
> 로고를 화면에 올리는 순간 시안 로고 위 웜 크림이라는 온도 충돌이 드러난다.
> 대신 **로고 안에 실재하는 값만** 쓴다 — 지어낸 파랑을 넣지 않는다.

## 1. 색 — 토큰으로만 쓴다

쿨 뉴트럴 계열이다. 바탕을 순백으로 두지 않는다 — 대화가 길어지는 화면에서 순백은 눈이 빨리 지친다.

### 브랜드 원색과 그 한계

로고에서 뽑은 값은 셋이다. **그중 둘은 글자·버튼 색으로 쓸 수 없다.**

| 로고 값 | 자리 | 흰 글자 대비 | 판정 |
|---------|------|--------------|------|
| `#41BAE9` | D 마크 본체 | 2.2:1 | 버튼색 불가. **다크 테마의 accent 로만** 쓴다 |
| `#F2931D` | 좌하단 블록 | 2.3:1 | 밝은 면 위 글자색 불가. **배경 칠**과 **어두운 고정 스크림 위 아이콘**에만 쓴다(`highlight`) |
| `#3F4444` | 워드마크 | — | 본문 잉크의 기준점 |
| `#0070B5` | D 마크 접힘면 그라데이션의 가장 어두운 지점 | 5.3:1 | **라이트 테마의 accent** |

`accent` 가 `#0070B5` 인 것은 타협이 아니다. 원색 `#41BAE9` 를 임의로 어둡게 깎은 값이 아니라
**로고 파일 안에 이미 존재하는 픽셀**이다(원본 PNG 를 x 방향으로 훑어 실측).
오렌지를 AA 까지 어둡게 깎으면 `#965D0B` 수준의 갈색이 되어 브랜드 인식이 깨지므로, 그쪽은 아예
글자로 쓰지 않는 쪽을 택했다.

### 라이트

| 토큰 | 값 | 쓰임 |
|------|-----|------|
| `canvas` | `#F7F9FB` | 화면 바탕 |
| `surface` | `#EDF1F5` | 사이드바 · 가라앉은 면 |
| `raised` | `#FFFFFF` | 카드 · 모달 · 입력창 |
| `line` | `#CDD3DA` | 실선 구분 |
| `ink` | `#2A2F33` | 본문 |
| `ink-muted` | `#666E76` | 보조 텍스트 |
| `accent` | `#0070B5` | 강조 · 활성 · 주요 버튼 · 포커스 |
| `accent-ink` | `#FFFFFF` | accent 위 글자 |
| `accent-soft` | `#E1F1FA` | 활성 항목 배경 |
| `highlight` | `#F2931D` | 주의 배지 배경(「자료 없음」) + **어두운 고정 스크림 위 아이콘**(첨부 실패). 밝은 면 위 글자로는 쓰지 않는다 |
| `highlight-ink` | `#2A2F33` | highlight 위 글자 |
| `danger` | `#C0392B` | 삭제 · 오류 |
| `danger-ink` | `#FFFFFF` | danger 위 글자 |
| `danger-soft` | `#FBE9E7` | 오류 배너 배경 |

`line` 과 `ink-muted` 는 #151 이 처음 제안한 `#DCE3EA` · `#6B747C` 보다 한 단계 짙다.
제안값으로는 「보조 / 사이드바」가 4.19:1 로 AA 에 못 미쳐 실측 후 내렸다.

### 다크

| 토큰 | 값 | 비고 |
|------|-----|------|
| `canvas` | `#12171A` | |
| `surface` | `#1A2126` | |
| `raised` | `#222B31` | |
| `line` | `#2E383F` | |
| `ink` | `#E6EDF2` | |
| `ink-muted` | `#93A1AB` | |
| `accent` | `#41BAE9` | **로고 원색 그대로.** 어두운 면에서는 이쪽이 대비를 번다 |
| `accent-ink` | `#06222F` | |
| `accent-soft` | `#10303F` | |
| `highlight` | `#F2931D` | 라이트와 같은 값 — 오렌지는 양쪽에서 다 뜬다 |
| `highlight-ink` | `#1B1205` | |
| `danger` | `#F07167` | |
| `danger-ink` | `#2A0F0C` | **흰색이 아니다** — 다크의 danger 위 흰 글자는 2.89:1 이다 |
| `danger-soft` | `#3A1F1C` | |

### 측정한 대비 (WCAG 2.1 상대휘도)

**토큰 쌍** 18개를 라이트·다크 양쪽에서 쟀고 전부 기준을 넘는다. 빡빡한 쪽만 옮긴다.

| 쌍 | 라이트 | 다크 | 기준 |
|----|--------|------|------|
| 본문 / 바탕 | 12.81 | 15.27 | 4.5 |
| 보조 / 사이드바 | 4.56 | 6.15 | 4.5 |
| 버튼 글자 / 버튼 | 5.27 | 7.38 | 4.5 |
| 활성 대화 글자 / 배경 | 4.56 | 6.21 | 4.5 |
| accent 아이콘 / 사이드바 | 4.64 | 7.31 | 4.5 |
| 자료없음 글자 / 배지 | 5.77 | 7.90 | 4.5 |
| 오류 글자 / 오류 배경 | 4.64 | 5.22 | 4.5 |
| 삭제 확인 버튼 글자 / 버튼 | 5.44 | 6.20 | 4.5 |

### 토큰 밖 겹침 — 실측 (#155)

반투명을 겹치면 실제 바탕이 토큰 값이 아니게 된다. 그 자리는 위 표가 못 덮으므로 따로 잰다.
**아래 면이 여럿이면 최악값**을 적는다(오버레이는 `canvas`·`surface`·`raised` 중 최악,
첨부 실패 패널은 임의 이미지 중 최악인 흰 이미지).

| 자리 | 조합 | 라이트 | 다크 | 기준 |
|------|------|--------|------|------|
| 드롭 오버레이 글자 | `text-ink` / `bg-canvas/85` | 12.70 | 14.86 | 4.5 |
| 드롭 오버레이 점선 | `border-accent` / `bg-canvas/85` | 4.95 | 7.89 | 3.0 |
| 첨부 실패 아이콘 | `text-highlight` / `bg-black/75` + 이미지 | 4.43 | 4.43 | 3.0 |

첨부 실패 패널이 양 테마에서 같은 값인 것은 **그 패널이 테마와 무관한 고정 어두운 면**이기
때문이다. 같은 이유로 **여기에는 테마 의존 토큰을 쓸 수 없다** — `danger` 를 쓰면 라이트의
`#C0392B` 가 어두운 패널에 얹혀 **1.06** 이 된다.

스크림을 `bg-black/60` 에서 `/75` 로 내린 것도 이 표 때문이다 : 60% 에서는 `highlight` 가
**2.45** 로 아이콘 기준 3.0 에 미달했다(종전 `amber-400` 은 3.44 로 통과했지만 토큰 밖 색이었다).

| 스크림 | `highlight` | `white` |
|--------|------------:|--------:|
| `bg-black/60` | 2.45 | 5.74 |
| `bg-black/70` | 3.61 | 8.45 |
| **`bg-black/75`** | **4.43** | 10.37 |

### 이 표가 덮지 못하는 것

**"토큰 쌍"이라고 쓴 것은 한정이다.** 화면에는 토큰끼리 만나지 않는 조합이 남아 있고,
그건 위 계산에 들어가지 않는다. 바로 위 「토큰 밖 겹침」 셋은 #155 에서 고쳐 재 놓았고,
아래 둘은 **아직 그대로다** — **#151 이 만든 것이 아니라 그 전부터 있었고, #151 범위(색과 로고)
밖이라 고치지 않았다.** #155 도 이 둘은 이슈 본문이 명시적으로 범위 밖에 두었다.

| 자리 | 값 | 기준 | 비고 |
|------|-----|------|------|
| `border-line` / `canvas` (입력 테두리) | 1.43 (라이트) | WCAG 1.4.11 은 3.0 | #151 이 1.24 → 1.43 으로 **올렸지만 여전히 미달**. 3.0 을 맞추면 테두리가 눈에 띄게 진해져 색 범위를 넘는 디자인 변경이 된다 |
| `text-danger` / `bg-black/90` (`CameraCapture`) | 3.23 (라이트) | 4.5 | #151 전후 동일(3.23 → 3.23). 다크는 6.53 → 7.17 로 개선됐다. 안쪽 미리보기를 검정으로 두는 것은 §5 의 결정이다 |

**대비 주장을 검사하는 게이트는 없다.** `check-doc-versions.sh` 가 버전 주장을 지키는 것과 달리
대비 주장은 아무도 안 본다 — 색을 건드리면 이 표를 손으로 다시 재야 한다.
(#151 에서 게이트 신설은 범위 밖으로 두었다. 필요해지면 별도 이슈로 다룬다.)

### 쓰는 방법 (중요)

토큰은 `index.css` 의 `:root` · `[data-theme="dark"]` 에 CSS 변수로 두고, Tailwind 4 의 `@theme` 이
그 변수를 가리키게 한다. 그래서 **색에는 `dark:` 접두를 쓰지 않는다** — `bg-surface` 한 번이면 두 테마가 다 된다.

```
bg-canvas · bg-surface · bg-raised · from-canvas
text-ink · text-ink-muted · border-line
bg-accent · text-accent · text-accent-ink · bg-accent-soft · border-accent
bg-highlight · text-highlight · text-highlight-ink
bg-danger · text-danger · text-danger-ink · bg-danger-soft
```

19종이 실제로 쓰인다(#155 에서 `text-highlight` 가 늘었다). **토큰 14개가 전부 쓰이고, 쓰는데 정의 안 된 것은 없다.**
(`TextInput` · `Composer` 의 포커스 링은 유틸리티가 아니라 `var(--c-accent-soft)` 를 직접 참조한다)

**토큰을 만들면 쓰는 자리를 함께 정한다.** #151 신규 4종은 자리가 이렇게 정해져 있다.

| 토큰 | 자리 | 사용 |
|------|------|------|
| `highlight` · `highlight-ink` | `chat/MessageList.tsx:181` 「자료 없음」 배지 | 각 1회 (같은 줄) |
| `highlight` | `chat/Composer.tsx` 첨부 실패 아이콘 — **#155** | 1회. 어두운 고정 스크림 위라 테마 의존 토큰을 못 쓴다 |
| `danger-ink` | `ConfirmModal.tsx:42` 삭제 확인 버튼 | 1회 — `bg-danger` 가 있는 유일한 자리다 |
| `danger-soft` | `pages/AdminPage.tsx:166` 관리자 오류 배너 | 1회 |
| `danger-soft` | `pages/MyPage.tsx` 오류 배너 — **#155** | 1회. 관리자 쪽과 같은 모양인데 #151 이 한쪽만 고쳤다 |

쓰이지 않는 토큰은 다음 사람이 아무 데나 갖다 쓰는 근거가 된다.
**#155 에서 `highlight` 와 `danger-soft` 가 각각 한 자리씩 늘어 지금은 둘 다 두 곳이다.**

`dark:` 는 색이 아닌 것(그림자 세기, 반투명 겹침 등)에만 남긴다.

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
| 그림자 | **두 단계다.** 아래 표 참고 | 확산형만. 짙은 `shadow-md` 금지 |
| 구분선 | `border-line` 1px | 필요한 곳에만. 면 색 차이로 구분되면 선을 넣지 않는다 |

### 그림자는 두 단계다

깊이를 섞으면 같은 층위의 것들이 다른 높이로 보인다. **면 위에 얹힌 것과 화면 위에 뜬 것을 나눈다.**

| 토큰 | 값 | 쓰는 곳 |
|------|-----|---------|
| `--shadow-ambient` | `0 1px 2px rgb(0 0 0 / .04), 0 8px 24px -12px rgb(0 0 0 / .1)` | 면 위 카드 · 입력창 · 「새 대화」 버튼 |
| `--shadow-lifted` | `0 2px 4px rgb(0 0 0 / .05), 0 16px 40px -16px rgb(0 0 0 / .18)` | **화면 위에 뜬 것** — 모달(`ConfirmModal` · `AdminPage`) · 드로어(`ChatPage`) · 팝오버(`Sidebar`) · `+` 메뉴(`Composer`) · 카메라 시트(`CameraCapture`) |

`--shadow-lifted` 는 v1.0 부터 6곳에서 쓰였는데 **이 표에 없었다**(#153 에서 채움).
이 절만 보고 모달에 `ambient` 를 쓰면 기존 모달과 깊이가 갈린다.

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
| Warm Editorial 팔레트 | ~~채택~~ → **폐기** | v1.0 에서 채택했으나 #151 에서 버렸다. 회사 CI 와 온도가 정면으로 어긋난다(§1) |
| 종이 질감(노이즈 오버레이) | 버림 | 면 색 차이만으로 계층이 충분히 읽힌다. 고정 오버레이를 한 겹 더 얹을 이유가 없다 |
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

모티프는 **회사 CI 의 D 마크** 다(#151). v1.0 의 「말풍선 + 문서 + 출처 링크」 자체 제작 아이콘은 버렸다 —
제품을 설명하는 그림보다 회사를 식별하는 표식이 탭에서 할 일을 더 잘한다.

사방에 **12% 여백**을 둔다. 여백 없이 꽉 채우면 32px 로 줄었을 때 가장자리가 타일에 물린다.

**벡터 정본은 `frontend/src/components/Logo.tsx` 의 `variant="mark"` 다.** 파비콘 전용 SVG 를
따로 두지 않는다 — 같은 좌표를 두 파일이 들고 있게 되고, 한쪽만 고쳐도 잡아 줄 게이트가 없다.
(#153 에서 실제로 `favicon.svg` 를 커밋해 봤다가 **몇 시간 만에 오렌지 경로가 한 글자 갈라져**
되돌렸다.)

| 파일 | 쓰임 | 배경 |
|------|------|------|
| `frontend/public/favicon-source.png` | 512px 래스터. `Logo.tsx` 의 마크를 렌더한 산출물이고 작은 크기는 여기서 뽑는다 | 투명 |
| `frontend/public/favicon.ico` | 16 · 32 · 48px 묶음 (탭) | 투명 |
| `frontend/public/favicon-32.png` | 32px PNG | 투명 |
| `frontend/public/apple-touch-icon.png` | 180px (iOS 홈 화면) | **흰 타일** |

#151 은 이 절에 「파비콘 SVG」를 전제한 문장을 남겼는데 **그 파일이 저장소에 없었다.**
계획 단계에서는 `logo-mark.svg` 를 커밋할 예정이었고, 구현이 인라인 SVG 로 바뀌면서 그 문단만
주인을 잃은 것이다(#153 에서 정리).

`favicon-source.png` 는 **아무도 참조하지 않는 채 빌드 산출물에 실린다**(10KB). 생성 중간 산물이
`public/` 에 있어서인데, 줄이려면 빌드가 복사하지 않는 곳으로 옮겨야 한다. **이번 범위 밖이라 두었다.**

### 재생성 절차

`Logo.tsx` 의 마크를 고쳤을 때만 돌린다. **3단계다.**

1. `Logo.tsx` 에서 `MARK` · `ORANGE` · `FOLD_STOPS` 를 읽어 12% 여백을 넣은 512px SVG 문자열을 만든다
2. 브라우저로 512px 렌더 (`omitBackground` 로 투명 유지)
3. Pillow 로 32px · 180px(흰 타일) · ico(16·32·48) 파생

2·3 단계는 이렇다.

```bash
# 2) SVG 문자열 -> 512px PNG
node -e "
const {chromium}=require('playwright'),{readFileSync}=require('fs');
(async()=>{const b=await chromium.launch(),p=await(await b.newContext({viewport:{width:512,height:512}})).newPage();
await p.setContent('<body style=\"margin:0\">'+readFileSync(process.argv[1],'utf8')+'</body>');
await p.screenshot({path:'frontend/public/favicon-source.png',omitBackground:true});await b.close()})()" <svg파일>

# 3) 512px -> 나머지 3종
python -c "
from PIL import Image
s=Image.open('frontend/public/favicon-source.png').convert('RGBA')
s.resize((32,32),Image.LANCZOS).save('frontend/public/favicon-32.png')
t=Image.new('RGBA',(180,180),(255,255,255,255)); t.alpha_composite(s.resize((180,180),Image.LANCZOS))
t.convert('RGB').save('frontend/public/apple-touch-icon.png')
s.save('frontend/public/favicon.ico',sizes=[(16,16),(32,32),(48,48)])"
```

**1단계의 좌표 주의** : 여백을 주려면 마크를 `translate` 안에 넣게 되는데,
`gradientUnits="userSpaceOnUse"` 는 **참조하는 요소(rect)의 좌표계**에서 해석된다.
`x1`/`x2` 에 translate 밖 좌표를 넣으면 접힘면 음영이 그만큼 밀려 **탭의 파비콘과 화면 안 로고가
서로 달라진다** — #151 에서 실제로 겪었고 #152 리뷰에서 잡혔다.

**검증** : 돌린 결과가 커밋된 `favicon-source.png` 와 **픽셀 단위로 같아야 한다**
(#153 에서 최대 채널차 0 으로 확인). 다르면 마크를 고쳤거나 렌더러가 바뀐 것이다.

**1단계를 자동화하는 스크립트는 없다.** 마크가 바뀌는 일이 드물어 근거가 한 건뿐이고,
이 저장소는 그럴 때 도구를 만들지 않는다(#55 · #149 기준). 필요해지면 그때 만든다.

`apple-touch-icon` 만 흰 타일을 까는 이유 : iOS 는 투명을 검게 메워 버려서, 투명으로 두면
홈 화면에서 검은 사각형 위에 마크가 앉는다.

`frontend/index.html` 이 png · ico 를 가리키고, 주소창 색(`theme-color`)은 라이트·다크 각각 `canvas` 값과 같다.
다만 **`theme-color` 는 `data-theme` 이 아니라 OS 설정(`prefers-color-scheme`)을 본다** — 앱 설정과
OS 가 어긋나면 주소창만 반대 테마가 된다(#156).
32px 로 줄이면 접힘면 그라데이션은 뭉개지지만 **D 실루엣과 오렌지 블록은 남는다** — 그 상태에서도 구분되는 것을 채택 기준으로 삼았다.

## 7-3. 로고 자산

정본은 `frontend/src/components/Logo.tsx` 다. **파일이 아니라 인라인 SVG 로 둔다** —
`<img>` 로 불러오면 워드마크 색을 테마에 맞출 수 없다. 자리는 `icons.tsx` 와 같은 규칙(자체 SVG 는 `components/` 안)이다.

| 항목 | 내용 |
|------|------|
| 원본 | `디인사이트 CI.ai` (PDF 1.6 호환). 저장소 밖에 있다 — 회사 자산이라 여기서 관리하지 않는다 |
| 채택 락업 | **국문(디인사이트)**. UI 가 전부 한국어라 결이 맞고, 1250x290 으로 영문판보다 짧아 사이드바에 잘 들어간다 |
| `variant="full"` | D 마크 + 워드마크. 로그인 · 사이드바 |
| `variant="mark"` | D 마크만. 모바일 헤더 · **파비콘의 벡터 정본**이다 — `favicon-source.png` 를 이 마크에서 렌더하고 작은 크기는 거기서 뽑는다(§7-2) |
| `className` | **필수다.** 기본값을 두면 호출부가 넘긴 값이 병합이 아니라 교체라, 크기 없는 className 하나에 `h-`/`w-` 가 사라지고 SVG 가 부모 폭 전체로 부푼다 (#154) |
| `decorative` | 스크린리더에서 숨긴다. **같은 화면에 이름을 읽어 주는 로고가 실제로 있을 때만** 켠다 — 모바일 헤더 마크는 드로어가 열렸을 때만 해당한다 (#154) |
| 워드마크 색 | `currentColor` — **SVG 하나로 라이트·다크가 다 된다** |
| D 마크 색 | 양 테마에서 브랜드색 고정 |

**다크에서 D 마크를 흰색으로 뒤집지 않는다.** CI 에 화이트 단색판이 있지만 그건 색 재현을 보장 못 하는
인쇄·단색 용도다. 화면은 색을 정확히 내고, 시안·오렌지는 어두운 면에서 오히려 잘 산다.
뒤집는 것은 워드마크뿐이다.

접힘면 그라데이션은 원본에서 **18x17 래스터 마스크**였다. 실측해 보니 y 방향 변화가 전혀 없는 완전한
수평 램프라 `linearGradient` 로 갈아끼웠다. 원본 PNG 와 픽셀 대조한 결과는 :

| 영역 | 최대 채널차 |
|------|-------------|
| 세로막대 · 오렌지 블록 등 평면부 | 2 (래스터화 잡음) |
| **접힘면 램프 안쪽** | **10** |

램프가 0 이 아닌 것은 5스톱 선형 근사가 원본의 미세한 비선형을 못 따라가기 때문이다.
눈으로는 구분되지 않지만 **"완전히 같다"고 적지 않는다.**

**파비콘도 같은 그라데이션을 써야 한다.** 파비콘 SVG 는 마크를 `translate` 안에 넣는데,
`gradientUnits="userSpaceOnUse"` 는 **참조하는 요소의 좌표계**에서 해석되므로 `x1`/`x2` 도
translate 안 좌표를 써야 한다 — 밖 좌표를 넣으면 그라데이션이 그만큼 밀려, 탭의 파비콘과
화면 안 로고의 접힘면 음영이 서로 달라진다.

**경로 좌표를 손으로 고치지 않는다.** 벡터 원본에서 뽑은 값이며, 고칠 일이 생기면 원본에서 다시 뽑는다.

### 배치

| 자리 | variant | 크기 |
|------|---------|------|
| `LoginPage` 좌측 상단 | full | `h-10` |
| `Sidebar` 최상단 | full | `h-7` |
| `ChatPage` 모바일 헤더 | mark | `h-7 w-7` (`md:hidden`) |

사이드바에서 폭이 좁아질 때 마크로 줄이는 분기는 **두지 않았다.** 락업은 `h-7` 에서 121px 이고
사이드바 최소 폭이 200px(좌우 패딩 빼고 168px)이라 늘 들어간다.

## 8. 적용 결과

| 대상 | 상태 |
|------|------|
| `frontend/src/index.css` | 토큰 · `@theme inline` · Pretendard · 이징 · reduced-motion 규칙 |
| `frontend/src/components/Logo.tsx` | **#151 신규** — 회사 CI 국문 락업(인라인 SVG · `full`/`mark`) |
| `frontend/src/components/TextInput.tsx` · `ConfirmModal.tsx` · `ProtectedRoute.tsx` | 토큰 · 44px 터치 높이 · 이중 테두리 모달 · **#151** `ConfirmModal` 삭제 버튼을 `danger-ink` 로 |
| `frontend/src/components/chat/Sidebar.tsx` | 토큰 · 시간 묶음(오늘/지난 7일/이전) · 활성 항목 `accent-soft` |
| `frontend/src/components/chat/ResizableSidebar.tsx` | 신규 — 사이드바 폭 조절. **`FEAT-` ID 가 없다** — `features.md` 에 UI 카테고리가 없어 명세된 적이 없고, 구현이 정본이다 |
| `frontend/src/pages/ChatPage.tsx` | `100dvh` · 드로어 blur + 스크롤 잠금 · 스크롤 페이드 |
| `frontend/src/components/chat/MessageList.tsx` | 답변 버블 제거 · 사용자만 `raised` 카드 · **#151** 「자료 없음」 배지를 `highlight` 로 |
| `frontend/src/components/chat/Composer.tsx` · `Citations.tsx` | 떠 있는 입력 판 · safe-area · 토큰 · **#155** 드롭 오버레이를 검정 스크림에서 `canvas/85` 로, 첨부 실패 아이콘을 `highlight` 로 |
| `frontend/src/pages/LoginPage.tsx` · `MyPage.tsx` | Editorial Split · 카드 + 세그먼트 컨트롤 · **#151** 로그인 좌측 상단 로고(알약 텍스트 대체) · **#155** `MyPage` 오류 배너를 `danger-soft` 로(#151 이 `AdminPage` 만 고쳤다) |
| `frontend/src/pages/AdminPage.tsx` | **#151** 오류 배너를 `danger-soft` 로 — accent 가 파랑이 되며 연파랑 위 빨간 글씨로 깨지던 자리다 |
| `frontend/src/components/chat/CameraCapture.tsx` | 껍데기·버튼은 토큰, 안쪽 미리보기만 검정(영상이 주인공) |
| `frontend/src/components/ErrorBoundary.tsx` | 토큰 · `100dvh` · accent 알약 버튼 |
| `frontend/index.html` · `frontend/public/` | 파비콘 4종 · `theme-color` · `lang="ko"`(문서는 한국어인데 `en` 으로 선언돼 있었음) · **#151** 아이콘을 D 마크로 교체 |

`frontend/src/pages/ChatPage.tsx` 는 **#151** 로 모바일 헤더에 D 마크가 붙었다(`md:hidden`) —
드로어로 접히면 사이드바 로고가 보이지 않기 때문이다.

화면 코드에 남은 `zinc-*` 색은 0건이고, **화면이 쓰는 색은 전부 토큰이다.** 그래서 #151 의
전면 재도색이 화면의 색 클래스를 한 줄도 바꾸지 않고 끝났다. 손댄 컴포넌트 셋은 사정이 각각 다르다.

| 파일 | 바뀐 것 | 성격 |
|------|---------|------|
| `chat/MessageList.tsx:181` | `accent-soft`/`accent` → `highlight`/`highlight-ink` | **의미가 틀렸던 토큰** — 동작색을 주의에 쓰고 있었다 |
| `pages/AdminPage.tsx:166` | `bg-accent-soft` → `bg-danger-soft` | **재도색이 드러낸 것** — 종전엔 accent(테라코타)와 danger(붉은)가 같은 계열이라 우연히 어울렸다 |
| `components/ConfirmModal.tsx:42` | `text-white` → `text-danger-ink` | **재도색이 강제한 것** — 다크 danger 가 바뀌며 흰 글자가 2.89:1 이 됐다 |

### 색 값을 들고 있는 파일 — 셋이다

토큰이 유일한 출처라는 말은 **화면 코드**에 한정된다. 실제로 색 리터럴을 든 파일은 셋이다.

| 파일 | 값 | 왜 토큰이 아닌가 |
|------|-----|-----------------|
| `frontend/src/index.css` | 토큰 28개 (라이트·다크 각 14) | 정본 |
| `frontend/src/components/Logo.tsx` | 브랜드색 2 + 램프 5스톱 | **로고는 테마를 타면 안 된다.** 토큰은 `data-theme` 으로 뒤집히는데 CI 색은 양 테마에서 고정이어야 한다 — 토큰으로 빼는 순간 다크에서 로고가 다른 회사 색이 된다. 파비콘도 여기서 렌더하므로 사본을 따로 두지 않는다 |
| `frontend/index.html` | `theme-color` 2개 | `<meta>` 는 CSS 변수를 못 읽는다. `canvas` 와 **같은 값을 손으로 맞춘다** |

**이 예외는 [CONVENTIONS.md](../CONVENTIONS.md) 「스타일」에도 적혀 있다.** 한쪽만 읽고 고치면 어긋난다.

⚠️ **같은 값이 두 곳에 있다** : `#0070B5` 는 `index.css` 의 라이트 `accent` 이자 `Logo.tsx` 램프의
첫 스톱이고, `#41BAE9` 는 다크 `accent` 이자 `Logo.tsx` 의 `BRAND_CYAN` 이다. 출처는 같은 실측
픽셀이지만 **두 값은 독립적으로 변할 수 있다.** 한쪽만 고치면 문서의 「accent = 접힘면 최암부의
실측 픽셀」 주장이 조용히 거짓이 되고, 게이트 셋(`check-doc-refs` · `check-doc-sections` ·
`check-doc-versions`)은 경로·섹션명·버전만 보므로 전부 통과한다. **색을 건드릴 때 둘 다 본다.**

화면별 배치와 폭 조절 규격은 구현이 정본이며, 기능 단위 명세는 `docs/01_specs/features.md` 에 있다.
