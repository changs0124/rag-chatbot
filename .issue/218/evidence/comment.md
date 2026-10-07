## #218 작업 리포트 — 입력 칸 버튼 정렬 · 카메라 · 사진 선택 형식

**원인** : 입력 행이 `items-end`(바닥 정렬)인데 텍스트 영역 한 줄 높이가 15px × `leading-relaxed`(24.375) + py 20 = **44.375px** 였다. 버튼은 모바일 44px · md 이상 40px 이라 데스크탑에서 버튼 중심이 **2.19px 아래**로 처졌다. 「카메라」는 환경과 무관하게 항상 렌더됐고, 사진 선택기는 `accept="image/*"` 였다.

**변경** : `leading-6` + `md:py-2` 로 한 줄 높이를 44 / 40 에 정확히 맞춤 · 「카메라」는 `pointer: coarse` 에서만 · accept 를 서버 허용 목록(jpeg · png · webp · gif)으로.

| 측정 (버튼 중심 y − 입력 행 중심 y) | 변경 전 | 변경 후 |
|---|---|---|
| 데스크탑 1440 · + / 보내기 | +2.19px / +2.19px | 0 / 0 |
| 모바일 390 · + / 보내기 | +0.19px / +0.19px | 0 / 0 |
| 데스크탑 + 메뉴 | 사진 · 카메라 | 사진 |
| 모바일(터치) + 메뉴 | 사진 · 카메라 | 사진 · 카메라 |
| 사진 선택기 accept | `image/*` | `image/jpeg,image/png,image/webp,image/gif` |

### 데스크탑 1440 — 입력 칸 (박스 : + · 텍스트 영역 · 보내기)
| 변경 전 | 변경 후 |
|---|---|
| ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/218/evidence/before/desktop-single.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/218/evidence/after/desktop-single.webp) |

### 데스크탑 1440 — + 메뉴 (박스 : 메뉴)
| 변경 전 | 변경 후 |
|---|---|
| ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/218/evidence/before/desktop-menu.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/218/evidence/after/desktop-menu.webp) |

### 모바일 390 (터치 에뮬레이션) — 입력 칸 / + 메뉴
| 변경 전 | 변경 후 |
|---|---|
| ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/218/evidence/before/mobile-single.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/218/evidence/after/mobile-single.webp) |
| ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/218/evidence/before/mobile-menu.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/218/evidence/after/mobile-menu.webp) |

**알려진 한계 (사용자 확정)** : iOS Safari 는 이미지를 받는 file input 이면 accept 와 무관하게 「사진 찍기」를 보여 준다(WebKit 236981) — 막을 수 없어 `frontend.md` 「첨부 UI 계약」에 기록했다. Android 선택기 동작과 iOS 실기기는 **미확인**(헤드리스 에뮬레이션은 OS 선택기를 띄우지 않는다).

**참고** : 텍스트 영역은 자동으로 늘어나지 않는다(`rows={1}`, 넘치면 안쪽 스크롤). 그래서 여러 줄 입력에서도 버튼은 가운데 그대로다 — 초안의 「여러 줄이면 아래 정렬 유지」 기준은 해당 상황이 생기지 않아 `items-end` 를 그대로 두는 것으로 충족했다.

- 검증 : `npm run lint` · `npx vitest run` 120 통과(+3) · `npm run build` · doc 게이트 4종 · 케이스 하한 120/120
- 캡처 방법 : vite dev + Playwright `page.route` 로 `/api/*` 목업(백엔드·.env 무수정), DPR 2. 수치 원본 : `before/measure.json` · `after/measure.json`
