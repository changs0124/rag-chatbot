## 작업 요약

`RAG_INSTRUCTIONS` 에 「근거를 찾지 못했으면 인용을 하나도 달지 않는다. 검색된 문서가 무엇이고 거기에 무엇이 없는지 설명하는 문장도 인용하지 않는다」를 넣었다(1차 — 지시문 보강). 모델이 부재 설명 문장에 인용을 달아 `citations.isEmpty()` 판정이 뒤집히던 것이 원인이었다. 판정 로직(`:323`)과 인용 추출은 바꾸지 않았다.

## 측정 비교

같은 질문을 질문마다 새 대화로 5회씩. `APP_MODE=live` · `gpt-5.6-terra` · 공용 스토어 문서 2건(서보 매뉴얼 · 필드클레임).
before 는 main 이미지, after 는 이 브랜치로 빌드한 이미지.

| 지표 | 전 | 후 | 변화 |
| --- | ---: | ---: | ---: |
| A 무자료 — `noSource:true` | 1/5 | 5/5 | **+4** |
| B 유자료(AS 절차) — 출처 부착 | 5/5 | 5/5 | 유지 |

- A : `우리 회사 연차 휴가 신청 절차와 규정 알려줘.` — after 5회 모두 본문은 「찾지 못했습니다」, `citations: []`
- B : `터렛 서보 드라이브에서 AL.2144 저전압 알람으로 AS 접수가 …` — after 5회 모두 `필드클레임현황.md` 인용

회차별 원본(JSON 줄, 답변 앞 120자 포함) : `.issue/181/evidence/before/measure.txt` · `after/measure.txt`

## 변경 파일

- `backend/.../openai/OpenAiRealService.java` — 지시 한 줄 + Javadoc 에 #181 관측
- `backend/.../openai/OpenAiRealInstructionsTest.java` — 무인용 지시가 바디에 실리는지 케이스 1건
- `docs/01_specs/live-integration.md` — 3-1 진단표 행 추가, 3-2 에 전후 측정표 (v1.2)
- `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env` (`BACKEND_MIN` 230 → 231, 실측)

## 검증

- `./mvnw verify` 통과 (백엔드 231케이스)
- `scripts/check-all.sh` 통과 — 단 shellcheck · gitleaks · trivy 는 로컬에 없어 **돌지 않았다**
- 완료 기준 4개 중 4개 충족 (무자료 5/5 · 유자료 5/5 · 테스트 잠금 · 측정표 문서화)

## 남은 이슈

- **확률적 해법이다.** 모델을 바꾸면 다시 재야 한다(문서에 모델명과 함께 적어 둠). 재발하면 2차(판정 방식 변경)로 넘어간다
- 증거는 수치라 스크린샷을 찍지 않았다(백엔드 판정)
