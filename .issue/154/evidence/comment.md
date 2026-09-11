## 작업 요약

셋 다 #151 이 만든 것이고 원인은 하나라 한 커밋에 묶었다 — 컴포넌트 API 와 접근성을 덜 다듬은 채 배치했다.
`decorative` 를 드로어 상태에 묶고, `className` 을 필수 prop 으로 바꾸고, 로고 블록을 `px-6` 으로 옮겼다.
덤으로 `WORDMARK` 의 key 를 인덱스로 바꿨다.

## 변경 전후 — 사이드바 좌측 기준선

빨간 박스는 **로고 D 마크**(위)와 **「새 대화」 아이콘**(아래)이다. 박스의 **왼쪽 변**을 비교하면 된다.

| 전 | 후 |
| --- | --- |
| ![사이드바 정렬 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/154/evidence/before/sidebar-align.webp) | ![사이드바 정렬 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/154/evidence/after/sidebar-align.webp) |

`getBoundingClientRect().left` 실측 (1440x900, 데스크톱 사이드바) :

| 요소 | 전 | 후 |
| --- | ---: | ---: |
| 로고 D 마크 | 16px | **24px** |
| 「새 대화」 아이콘 | 24px | 24px |
| 대화 목록 항목 내용 | 20px | 20px |

**20px 은 일부러 두었다.** 24·20px 두 기준선은 #151 이전부터 있었고 #151 이 16px 을 하나 더 얹은 것이라,
#151 이 만든 것만 되돌렸다. 목록 항목은 hover 배경이 따로 있어 기준이 다르다.

## 나머지 셋은 화면에 나타나지 않는다

접근성 속성 · 타입 · React key 라 **캡처로 비교할 것이 없다.** 박스를 그리지 않은 이유도 이것이다.
그쪽 회귀 보호는 아래 테스트가 맡는다.

| 결함 | 고친 방식 | 지금 깨지고 있었나 |
| --- | --- | --- |
| 모바일 드로어 닫힘에서 접근 가능한 브랜드 이름 0개 | `decorative={sidebarOpen}` | **그렇다** |
| `className` 기본값이 도달 불가 + 병합이 아니라 교체 | 필수 prop 으로, `??` 제거 | 아니다(앞으로의 함정) |
| `key={d.slice(0, 24)}` | 인덱스로 | 아니다(7개 접두 실제 출력해 충돌 0건 확인) |

`className` 을 필수로 바꿨지만 **호출 코드는 한 줄도 바뀌지 않았다** — 3곳이 이미 전부 넘기고 있었다.
누락이 생기면 `tsc -b` 가 잡는다.

## 변경 파일

- `frontend/src/pages/ChatPage.tsx` — `decorative={sidebarOpen}`, 주석을 사실에 맞게 교체
- `frontend/src/components/Logo.tsx` — `className` 필수화, `??` 기본값 제거, key 인덱스화
- `frontend/src/components/chat/Sidebar.tsx` — 로고 블록 `px-4` → `px-6`
- `frontend/src/pages/ChatPage.test.tsx` — 신규 2건
- `scripts/case-floors.env` — `FRONTEND_MIN` 111 → 113 (실측)
- `docs/02_architecture/design-system.md` · `docs/06_changelog/CHANGELOG.md` — 바뀐 API 반영

## 검증

- `npm run lint` · `npm run build` · `npm run test` (**113/113**) 통과
- `scripts/check-case-floor.sh frontend` · `scripts/check-all.sh docs` 통과
  (`check-all.sh docs` 는 shellcheck 가 이 PC 에 없어 「셸 정적 분석」 1건을 **건너뛴다** — CI 러너에서는 돈다)
- **변이로 확인** : 항상 장식으로 되돌리면 닫힘 케이스가, 절대 장식이 아니게 하면 열림 케이스가 깨진다
- 캡처는 로컬 mock 모드 · 1440x900 · 라이트 테마

## 남은 이슈

- 드로어에 `aria-modal`/inert 가 없어 열린 동안 뒤 화면이 접근성 트리에 남는다. **이 이슈에서 고치지
  않았다** — 드로어 전반을 건드리는 별개 작업이고, 지금 수정은 그 사실을 전제로 성립한다(열림 상태에서
  헤더 마크를 숨기는 이유가 바로 그것이다).
- 모바일 390x844 캡처는 찍지 않았다. 1번 수정은 **접근성 트리 변화**라 스크린샷에 드러나지 않는다.
