## 결과

회사 CI(디인사이트)를 프론트에 반영하고 팔레트를 로고에서 파생시켰다. 브랜치 `feat/151-issue-151`.

### 무엇이 바뀌었나

| | before | after |
|---|---|---|
| **로그인 · 라이트** | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/before/login-light.webp" width="420"> | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/after/login-light.webp" width="420"> |
| **로그인 · 다크** | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/before/login-dark.webp" width="420"> | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/after/login-dark.webp" width="420"> |
| **채팅 · 라이트** | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/before/chat-light.webp" width="420"> | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/after/chat-light.webp" width="420"> |
| **채팅 · 다크** | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/before/chat-dark.webp" width="420"> | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/after/chat-dark.webp" width="420"> |
| **채팅 · 모바일 390x844** | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/before/chat-mobile.webp" width="420"> | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/after/chat-mobile.webp" width="420"> |
| **관리자 오류 배너** | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/before/admin-error.webp" width="420"> | <img src="https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/151/evidence/after/admin-error.webp" width="420"> |

박스는 변경 구간이다. before·after 모두 같은 URL·상태·뷰포트·셀렉터로 찍었다.

### 색을 고른 방식

로고 원색을 그대로 쓰지 못한다는 게 이 작업의 제약이었다.

| 로고 값 | 흰 글자 대비 | 처리 |
|---|---|---|
| `#41BAE9` (D 마크) | 2.2:1 | 버튼색 불가 → **다크 테마 accent 로만** |
| `#F2931D` (오렌지) | 2.3:1 | 글자색 불가 → **배경 칠 전용**(`highlight`) |
| `#0070B5` | 5.3:1 | **라이트 테마 accent** |

`#0070B5` 는 원색을 임의로 어둡게 깎은 값이 아니다. 원본 PNG 를 x 방향으로 0.5 단위씩 훑어
**D 마크 접힘면 그라데이션 안에 실재하는 픽셀**을 찾은 것이다. 오렌지는 AA 까지 깎으면
`#965D0B` 수준의 갈색이 되어 브랜드 인식이 깨지므로 아예 글자로 쓰지 않는 쪽을 택했다.

라이트·다크 **34쌍을 전부 계산해 기준을 넘는 것을 확인**했다. 빡빡한 쪽만 옮긴다.

| 쌍 | 라이트 | 다크 | 기준 |
|---|---|---|---|
| 보조 / 사이드바 | 4.56 | 6.15 | 4.5 |
| 활성 대화 글자 / 배경 | 4.56 | 6.21 | 4.5 |
| accent 아이콘 / 사이드바 | 4.64 | 7.31 | 4.5 |
| 오류 글자 / 오류 배경 | 4.64 | 5.22 | 4.5 |
| 버튼 글자 / 버튼 | 5.27 | 7.38 | 4.5 |

### 컴포넌트는 색 때문에 고치지 않았다

색 값이 `index.css` 한 파일에만 있고 화면은 토큰명만 쓰는 구조라, **전면 재도색이 CSS 변수 교체로 끝났다.**
손댄 컴포넌트 둘은 색 교체가 아니라 **의미가 틀렸던 토큰**을 바로잡은 것이다.

- `MessageList.tsx` 「자료 없음」 배지 — 동작이 아니라 **주의**인데 `accent`(동작색)를 쓰고 있었다 → `highlight`
- `AdminPage.tsx` 오류 배너 — 종전엔 `bg-accent-soft`(테라코타 틴트) 위 `text-danger`(붉은) 라 우연히 어울렸다.
  accent 가 파랑이 되는 순간 **연파랑 위 빨간 글씨**로 깨진다 → `danger-soft` (이 변경이 만든 파손이다)

### 로고

`frontend/src/components/Logo.tsx` 인라인 SVG. `<img>` 로 두면 워드마크 색을 테마에 맞출 수 없다 —
워드마크만 `currentColor` 로 두면 **SVG 하나로 라이트·다크가 다 된다.**

CI 에 화이트 단색판이 있지만 **다크에서도 D 마크는 브랜드색을 유지**한다. 그 판은 색 재현을
보장 못 하는 인쇄·단색 용도이고, 화면에서 시안·오렌지는 어두운 면에서 오히려 잘 산다.

접힘면 그라데이션은 원본이 18x17 **래스터 마스크**였는데 실측해 보니 y 방향 변화가 0 인 완전한
수평 램프라 `linearGradient` 로 갈아끼웠다. 원본 PNG 와 픽셀 대조했을 때 차이는 **1px 외곽
앤티에일리어싱뿐이고 채워진 면의 어긋남은 0건**이다.

사이드바에서 좁아질 때 마크로 줄이는 분기는 **두지 않았다** — 락업이 `h-7` 에서 121px 이고
사이드바 최소 폭이 200px(패딩 빼고 168px)이라 늘 들어간다.

### 완료 조건

- [x] `index.css` 토큰 교체 (라이트 · 다크)
- [x] 신규 토큰 3종이 실제 화면에서 쓰인다
- [x] `Logo.tsx` 커밋, 다크에서 워드마크가 뒤집힌다
- [x] 로고 4곳 배치 (로그인 · 사이드바 · 모바일 헤더 · 파비콘 4종)
- [x] 측정한 대비값을 문서에 기록, 전부 AA 4.5:1 이상
- [x] `design-system.md` 갱신, 문서 게이트 통과
- [x] `npm run build` · `lint` · `test` 통과
- [x] 테스트를 늘리지 않았으므로 `FRONTEND_MIN` 조정 없음

### 검증

```
npm run lint                 통과
npm run build                통과
npm run test                 16 파일 · 111/111 통과
bash scripts/check-all.sh docs   통과 (참조 232건 · 섹션 24건)
```

### 남긴 것

**대비 주장을 검사하는 게이트는 만들지 않았다.** 요청 범위(디자인·테마색) 밖이고 근거도 이 한 번뿐이라,
#149 에서 세운 "근거가 한 건뿐일 때 게이트를 만들지 않는다" 기준을 그대로 따랐다.
지금은 색을 건드리면 사람이 `design-system.md` 의 대비 표를 다시 재야 한다.
