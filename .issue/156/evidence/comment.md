## 작업 요약

테마 정본은 `data-theme` 하나인데 **`color-scheme` 과 `theme-color` 둘만 OS 설정을 직접 보고 있었다.**
`color-scheme` 은 `data-theme` 으로 갈라 주고, `theme-color` 는 `<meta>` 를 하나로 줄여
`ThemeProvider` 가 `--c-canvas` 를 읽어 갱신한다.

**새 규칙이 아니다** — `CONVENTIONS.md` 「스타일」이 이미 "`prefers-color-scheme` 를 직접 참조하지
않는다, 시스템 설정 해석은 `ThemeProvider` 가 단독으로 한다" 고 적어 뒀고, 그 규칙을 어긴 자리가
저장소에 딱 둘 남아 있었다.

## 조합 4개 실측

`<meta>` 는 DOM 에 그대로 있으므로 값을 읽어 확인할 수 있다. **주소창 자체는 캡처로 못 잡는다.**

| OS | 앱 설정 | `data-theme` | `color-scheme` 전 | **후** | `theme-color` 전 | **후** |
| --- | --- | --- | --- | --- | --- | --- |
| 라이트 | 라이트 | `light` | `light dark` | **`light`** | `<meta>` 2개 | **`#f7f9fb`** |
| 라이트 | 다크 | `dark` | `light dark` | **`dark`** | `<meta>` 2개 | **`#12171a`** |
| 다크 | 라이트 | `light` | `light dark` | **`light`** | `<meta>` 2개 | **`#f7f9fb`** |
| 다크 | 시스템 | `dark` | `light dark` | **`dark`** | `<meta>` 2개 | **`#12171a`** |

「전」의 `theme-color` 칸이 값이 아니라 「2개」인 이유 : 미디어쿼리로 갈린 `<meta>` 가 둘이라
**어느 쪽이 쓰이는지는 DOM 이 알려 주지 않는다.** 브라우저가 OS 기준으로 고르므로 앱 설정과
어긋날 수 있었던 것이고, 지금은 하나뿐이라 값이 곧 답이다.

원본은 `.issue/156/evidence/{before,after}/theme-combos.txt`.

## 스크롤바 — 어긋나는 조합 두 개

빨간 박스가 사이드바 대화 목록의 스크롤바다.

| 조합 | 전 | 후 |
| --- | --- | --- |
| OS 다크 · 앱 라이트 | ![OS 다크 앱 라이트 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/156/evidence/before/scrollbar-os-dark-app-light.webp) | ![OS 다크 앱 라이트 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/156/evidence/after/scrollbar-os-dark-app-light.webp) |
| OS 라이트 · 앱 다크 | ![OS 라이트 앱 다크 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/156/evidence/before/scrollbar-os-light-app-dark.webp) | ![OS 라이트 앱 다크 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/156/evidence/after/scrollbar-os-light-app-dark.webp) |

**썸네일로는 차이가 작아 보인다.** 그래서 픽셀을 직접 쟀다 — 스크롤바 기둥(장치픽셀 x 496~514)의
평균·최소·최대다. **두 줄이 정확히 서로 맞바뀐다.**

| 조합 | | 평균 | 최소 | 최대 | 읽는 법 |
| --- | --- | ---: | ---: | ---: | --- |
| OS 다크 · 앱 라이트 | 전 | 160 | **44** | 162 | 최소 44 = **검은 트랙** → 다크 스크롤바 |
| | **후** | 139 | 135 | **254** | 최대 254 = **흰 트랙** → 라이트 스크롤바 |
| OS 라이트 · 앱 다크 | 전 | 139 | 135 | **254** | 흰 트랙 → 라이트 스크롤바 (앱은 다크인데) |
| | **후** | 160 | **44** | 162 | 검은 트랙 → 다크 스크롤바 |

구분은 **트랙 색**이다(다크 44 ↔ 라이트 254). 썸은 양쪽 다 회색이라 눈에 덜 띈다.

> 캡처는 **헤디드 크로뮴**으로 찍었다. 헤드리스는 오버레이 스크롤바를 써서
> `offsetWidth - clientWidth` 가 **0** 이고 스크롤바가 그림에 아예 안 나온다.

## 변경 파일

- `frontend/src/index.css` — `:root { color-scheme: light }` · `:root[data-theme="dark"] { color-scheme: dark }`
- `frontend/index.html` — `theme-color` 2개(미디어쿼리) → 1개(초기값)
- `frontend/src/theme/ThemeContext.tsx` — `applyTheme` 이 `--c-canvas` 를 읽어 `<meta>` 갱신
- `frontend/src/theme/ThemeContext.test.tsx` — 신규 2건
- `scripts/case-floors.env` — `FRONTEND_MIN` 111 → 113 (실측)
- `docs/02_architecture/design-system.md` · `docs/CONVENTIONS.md` · `docs/06_changelog/CHANGELOG.md`

## 색 값을 늘리지 않았다

`design-system.md` 「색 값을 들고 있는 파일」은 **여전히 셋**이다.

- `applyTheme` 은 색을 들지 않는다 — `data-theme` 을 바꾼 **뒤** `getComputedStyle` 로 `--c-canvas` 를
  읽으므로 정본은 `index.css` 그대로다.
- `index.html` 의 값은 **초기값**으로만 남았고, 그 사실을 `design-system.md` 표와 `CONVENTIONS.md`
  양쪽에 적었다.
- **테스트에도 색을 적지 않았다.** 적었으면 네 번째 자리가 생긴다. 테스트가 토큰을 심고 `<meta>` 가
  그것을 따라오는지라는 **배선**을 단언한다.

## 검증

- `npm run lint` · `npm run build` · `npm run test` (**113/113**) 통과
- `scripts/check-case-floor.sh frontend` (실측 113 / 하한 113) · `scripts/check-all.sh docs` 통과
  — `check-all.sh docs` 는 로컬에 shellcheck 가 없어 「셸 정적 분석」 1건을 **건너뛴다**(CI 러너에서는 돈다)
- **변이로 확인** — `<meta>` 갱신을 빼면 새 테스트 2건이 모두 깨진다
- **빌드 산출물 확인** — CSS 에 `color-scheme:light` · `color-scheme:dark` 둘 다 있고 `light dark` 는 0건
- `color-scheme` 은 jsdom 이 스타일시트를 적용하지 않아 **단위 테스트로 단언할 수 없다** — 위 캡처와
  픽셀 측정이 그 자리를 대신한다

## 남은 이슈

- **이 브랜치는 `docs/153-issue-153` 위에 쌓았다.** #153 이 바로 그 문단에
  "`theme-color` 는 OS 설정을 본다(#156)" 는 문장을 새로 넣어 뒀고, main 에서 따면 그 문장을 고칠
  수가 없다. **PR 은 #157 이 머지된 뒤에 의미가 생긴다** — 순서를 지켜야 한다.
- 「전」 조합표는 커밋 뒤에 세 파일을 **임시로 되돌려(HMR) 재고 곧바로 `git checkout --` 으로 복원**해
  얻었다. 커밋된 코드는 그대로다.
