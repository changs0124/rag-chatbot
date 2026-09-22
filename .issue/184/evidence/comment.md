## 작업 요약

실연동을 끝냈는데 「아직 못 했다」로 남아 있던 문서 3개 · 코드 주석 3곳을 오늘 관측에 맞췄다. **확인됨은 관측으로 뒷받침되는 것만** 적었고, 배포 환경 투입은 남은 것으로 따로 적었다. 코드 동작은 바뀌지 않는다.

## 관측 (before 증거)

`APP_MODE=live` · `gpt-5.6-terra` · 공용 스토어 문서 2건에서 실채팅으로 기록했다.

| 항목 | 관측 | 대응 |
| --- | --- | --- |
| 이벤트 순서 | meta → stage → token → citations → done | 2-4 |
| 토큰 스트리밍 | token 이벤트 345개(뭉치지 않음) | 2-4 확인 ① |
| 검색 단계 | stage `analyzing → searching → generating` | 가정 A · 2-4 확인 ② |
| 정상 종료 | `done {finishReason: stop}` | 가정 B |
| 인용 | 업로드한 파일명 2개 | 가정 C · 2-4 확인 ③ |
| 스니펫 | 본문 201자씩 | 가정 D · E |
| 무자료 | citations 0 · `noSource: true` | 2-5 |
| 이미지 | 「ALARM AL.2144 …」 이미지 → 답변 `2144` | 2-6 |
| 업로드 | 문서 2건 `completed` | 2-3 · 2-7 |

원본 : `.issue/184/evidence/before/live-observation.txt` (수정 전 낡은 서술 목록 포함)

## 변경

| 위치 | 전 | 후 |
| --- | --- | --- |
| `current-sprint.md` 진행 중 | 「OpenAI 실 연동 투입 — 착수 불가」 항목 | 항목 제거(끝난 일은 CHANGELOG), 런칭 준비물·블로커에 「키·스토어는 로컬용으로 확보, 배포용 결정은 남음」 |
| `live-integration.md` 0절 | 「컴파일과 구조만 검증」 | 「실 응답으로 검증됨」 + 남은 것은 배포 환경 투입 |
| `live-integration.md` 3절 | 「실물로 확인된 적 없는」 가정 A~E | 행마다 **확인됨** + 관측 내용, 증상 열은 진단용으로 유지 (v1.3) |
| `requirements.md` | REQ-RAG-005 **미검증** · Phase 9 「확보 시」 | 검증됨(근거 링크) · 「로컬 완료, 배포는 런칭과 함께」 (v1.1) |
| `OpenAiRealService` 머리주석 | 「M2 스파이크 · 컴파일만 검증」 + **07-28 결정과 모순되던 「무자료 접두가 저장 텍스트에 반영」** | 검증됨 + 정본 위치 |
| `OpenAiService` · `OpenAiRealStageMappingTest` | 「M2 스파이크에 남아 있음」 | 확인됨 |

## 검증

- `scripts/check-all.sh` 통과 — 섹션 참조 게이트가 「런칭」 헤딩 오기를 한 번 잡아 고쳤다. shellcheck · gitleaks · trivy 는 로컬에 없어 돌지 않았다
- 컴파일 + `OpenAiReal*Test` 3종 통과
- 낡은 서술 잔존 0건 — `.issue/184/evidence/after/checks.txt`

## 남은 이슈

- `OpenAiMockService.java:18` 의 「아니면 무자료 접두」 도 07-28 결정이 반영 안 된 흔적이다. 원인이 달라 #186 에 넣는다
