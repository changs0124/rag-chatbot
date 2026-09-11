## 작업 요약

#151 은 `index.css` 의 토큰만 갈아끼웠고 **토큰 밖에 직접 박힌 색은 훑지 않았다.** 세 자리를 고쳤다.
다만 **2번은 이슈가 제안한 두 방향이 실측상 둘 다 지금보다 나빠서**, 색만 바꾸지 않고 스크림을 함께 내렸다.

## 1. 드롭 오버레이 — 라이트에서 AA 미달이었다

빨간 박스는 「여기에 놓아 첨부」 문구다. **오버레이가 `fixed inset-0` 이라 변경이 화면 전체에 퍼지므로**
점선 프레임에는 박스를 그리지 않았다 — 앱의 점선과 주석용 박스가 겹쳐 읽히기 때문이다.

| | 전 | 후 |
| --- | --- | --- |
| 라이트 | ![드롭 오버레이 라이트 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/155/evidence/before/drop-overlay-light.webp) | ![드롭 오버레이 라이트 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/155/evidence/after/drop-overlay-light.webp) |
| 다크 | ![드롭 오버레이 다크 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/155/evidence/before/drop-overlay-dark.webp) | ![드롭 오버레이 다크 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/155/evidence/after/drop-overlay-dark.webp) |

`bg-black/30` + `text-white` 는 **다크 전제로 쓴 스크림**이다. 라이트에서는 검정 30% 가 밝은 회색
`rgb(173,174,176)` 이 되어 그 위 흰 글자가 거의 안 보인다.

| 조합 | 라이트 (canvas / surface / raised) | 다크 | 기준 |
| --- | ---: | ---: | ---: |
| `text-white` / `bg-black/30` (전) | **2.22 / 2.36 / 2.10** | 19.09 / 18.04 / 16.83 | 4.5 |
| `border-white/70` (전) | **1.79 / 1.87 / 1.71** | 9.50 / 9.19 / 8.83 | 3.0 |
| `text-ink` / `bg-canvas/85` (후) | **12.70** (최악) | 14.86 | 4.5 |
| `border-accent` / `bg-canvas/85` (후) | **4.95** (최악) | 7.89 | 3.0 |

불투명도는 85·90·95 가 사실상 같은 값이라(아래 면 셋이 `canvas` 와 가깝다) **뒤가 비치는 85** 를 골랐다.

## 2. 경고 아이콘 — 이슈 제안 두 가지가 둘 다 지금보다 나쁘다

| 전 (`bg-black/60` + `amber-400`) | 후 (`bg-black/75` + `highlight`) |
| --- | --- |
| ![첨부 실패 아이콘 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/155/evidence/before/upload-error-icon.webp) | ![첨부 실패 아이콘 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/155/evidence/after/upload-error-icon.webp) |

썸네일은 **흰 이미지**다 — 이 자리의 **대비 최악 조건**이라 일부러 그렇게 찍었다.
패널이 `bg-black/<a>` + `text-white` 라 **테마와 무관한 고정 어두운 면**이므로 라이트 한 장만 찍었다.

| 후보 | 흰 이미지(최악) | 중간 회색 | 검은 이미지 | 아이콘 기준 3.0 |
| --- | ---: | ---: | ---: | --- |
| `amber-400` (현재) | 3.44 | 7.57 | 12.58 | 통과 |
| `highlight` (이슈 제안) | **2.45** | 5.39 | 8.97 | **미달** |
| `danger` 라이트 (이슈 대안) | **1.06** | 2.32 | 3.86 | **심각한 미달** |
| `white` | 5.74 | 12.63 | 21.00 | 통과 |

`danger` 가 무너지는 이유는 위에 적은 것과 같다 — **고정 어두운 패널에 테마 의존 토큰을 쓸 수 없다.**
라이트의 `#C0392B` 가 어두운 패널에 얹힌다.

그래서 색만 바꾸지 않고 **스크림을 `bg-black/60` → `/75` 로 함께 내렸다.**

| 스크림 | `highlight` | `white` |
| --- | ---: | ---: |
| `bg-black/60` | 2.45 | 5.74 |
| `bg-black/70` | 3.61 | 8.45 |
| **`bg-black/75`** | **4.43** | 10.37 |

대가는 문서 규칙 변경이다 — `highlight` 「배경 전용」을 「배경 + **어두운 고정 스크림 위 아이콘**」으로
넓히고, 근거 수치를 `design-system.md` 「토큰 밖 겹침 — 실측」에 새 절로 남겼다.

## 3. `MyPage` 오류 배너 — **대비는 오히려 내려간다**

캡처하지 않았다. `bg-surface` → `bg-danger-soft` 는 배경 한 칸 차이라 전후 그림이 거의 같고,
**중요한 것은 그림이 아니라 숫자**다.

| | 전 `bg-surface` | 후 `bg-danger-soft` |
| --- | ---: | ---: |
| 라이트 | 4.79 | **4.64** |
| 다크 | 5.63 | **5.22** |

둘 다 4.5 를 넘으므로 접근성 회귀는 아니다. **이건 대비 개선이 아니라 일관성 수정이다** —
#151 이 `AdminPage` 의 같은 모양 배너만 고치고 이쪽을 놓쳤다. 숨기지 않고 적는다.

## 변경 파일

- `frontend/src/components/chat/Composer.tsx` — 오버레이 3개 클래스 · 실패 패널 스크림 · 아이콘 색
- `frontend/src/pages/MyPage.tsx` — 오류 배너 `danger-soft`
- `docs/02_architecture/design-system.md` — `highlight` 규칙 확대 + 「토큰 밖 겹침 — 실측」 신설
- `docs/06_changelog/CHANGELOG.md` — `[Unreleased] / Fixed`

## 검증

- `npm run lint` · `npm run build` · `npm run test` (**111/111**) 통과
- `scripts/check-case-floor.sh frontend` (실측 111 / 하한 111) · `scripts/check-all.sh docs` 통과
  — `check-all.sh docs` 는 로컬에 shellcheck 가 없어 「셸 정적 분석」 1건을 **건너뛴다**(CI 러너에서는 돈다)
- **Tailwind 팔레트 색 0건 재확인** — `frontend/src` 전체에 `slate|gray|red|amber|…-[0-9]{2,3}` 0건
- **빌드 산출물에서 신규 유틸리티 생성 확인** — `bg-canvas/85` 가 CSS 변수 + 불투명도 조합이라
  실제로 생성되는지 봐야 했다 : `color-mix(in oklab, var(--c-canvas) 85%, transparent)` ·
  `bg-black/75` = `#000000bf` · `text-highlight` · `border-accent` · `bg-danger-soft` 모두 존재,
  옛 `bg-black/30`·`/60` 은 0건
- **대비 계산기를 문서로 검증** — 이 코멘트의 모든 숫자는 같은 계산기가 냈고, 그 계산기는
  `design-system.md` 의 기존 값(「오류 글자 / 오류 배경」 4.64 · 5.22)을 소수점까지 재현한다

## 남은 이슈

- `design-system.md` 「이 표가 덮지 못하는 것」의 2건(입력 테두리 1.43, `CameraCapture` 3.23)은
  **그대로다.** 이슈 본문이 명시적으로 범위 밖에 두었다.
- **게이트도 테스트도 만들지 않았다.** 이슈는 "0건인지 **재확인**" 만 요구했고, #149 에서 세운
  "근거가 한 건뿐일 때 게이트를 만들지 않는다" 를 따랐다. 세 자리 전부 클래스 문자열이라 단언할
  층위도 아니다(이 저장소는 `toHaveClass` 가 0건이다). **대비 주장은 여전히 아무도 안 본다** —
  색을 건드리면 사람이 표를 다시 재야 한다.
- 「전」 첨부 실패 캡처는 **커밋 뒤에 두 줄만 임시로 되돌려 찍고 곧바로 복원**했다. 이 자리는
  계획 단계에서 캡처 대상이 아니었다가 구현 중에 추가됐다. 커밋된 코드는 그대로다.
