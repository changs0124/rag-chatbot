## 작업 요약

사용처가 0 인 프론트 코드 3개를 지우고, 현재 동작과 어긋난 주석 2곳을 고쳤다. 동작은 바뀌지 않는다 — 화면이 바뀌지 않아 캡처 대신 사용처 grep 과 테스트·빌드 결과를 증거로 남겼다.

## 변경 전후

| 대상 | 전 | 후 |
| --- | --- | --- |
| `endpoints.ts` `onMeta` | 정의 1 · 호출 1 · **소비자 0** | 제거. `meta` 이벤트는 `switch` 를 그냥 지나간다는 한 줄 주석 |
| `icons.tsx` `IconPaperclip` · `IconFile` | 정의만 있고 import 0 | 제거 |
| `HealthController` 주석 | 「Phase 2 SecurityConfig에서 permitAll **예정**」 | 「SecurityConfig 에서 permitAll」(`SecurityConfig.java:42`) |
| `OpenAiMockService` 머리주석 | 「아니면 무자료 **접두**」 — 같은 파일 25행의 07-28 결정(플래그)과 모순 | 「무자료 플래그(noSource)」 (#184 에서 넘어온 항목) |

## 검증

| 항목 | 전 | 후 |
| --- | ---: | ---: |
| `npm run lint` | 통과 | 통과 |
| vitest | 115 | 115 |
| `stream.test.ts` (`event:meta` 포함) | 통과 | 5/5 통과 |
| `npm run build` | 통과 | 통과 |
| 백엔드 컴파일 | — | 통과 |

`scripts/check-all.sh` 통과 — shellcheck · gitleaks · trivy 는 로컬에 없어 돌지 않았다. 케이스 수 하한 변화 없음.
원본 : `.issue/186/evidence/before/baseline.txt` · `after/checks.txt`

## 남은 이슈

없음. 리뷰에서 나왔지만 고치지 않기로 한 것(모달 셸 3곳 중복 · 백엔드 `startsWith` 4줄 중복 · `Citation.uri` 미표시 · `TODO(M2)`)은 이 이슈 범위 밖이다
