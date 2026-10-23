## 작업 요약

결정한 기준대로 지시문 `RAG_INSTRUCTIONS` 의 마지막 줄을 바꿨다.
- 기본은 한국어로 답한다
- 사용자가 다른 언어로 답해 달라고 **명시적으로 요청**하면 그 언어로 답한다. 이 요청은 같은 대화에서 사용자가 다른 언어를 다시 요청할 때까지 이어진다
- 질문이 다른 언어로 쓰였다는 것만으로는 요청으로 보지 않는다. 이때는 한국어로 답한다
- 어느 언어로 답하든 문서 이름 · 알람 번호 · 파라미터 번호 · S/N 표기는 원문 그대로 둔다

검색은 지금처럼 한국어 용어로도 찾는다(#377 줄은 그대로).

「같은 대화에서 이어진다」 부분은 리뷰가 다중 턴 동작이 정해져 있지 않다고 지적한 뒤에 정했다(10-23).

## 실측

운영 서버에서 OpenAI 를 직접 호출했다(`qprobe2/3.py`, 키는 서버 밖으로 나가지 않는다).
- 지시문 : javac 로 뽑은 **배포될 실제 문자열**
- 다중 턴 : 앱과 같은 role/content 이력을 앞에 붙였다
- 반복 : 문항마다 3회, 배터리는 1회
- 언어 판정 : 답에 쓰인 글자 중 한글 · 가나 · 한자 · 라틴 문자의 비율로 정했다

| 문항 | 기대 | 전 | 후 |
| --- | --- | ---: | ---: |
| E4 · E5 「answer in English please」 · 「Reply only in English」 | 영어 | 0/6 | **6/6** |
| E6 한국어 질문 + 「일본어로 답해줘」 | 일본어 | 0/3 | **3/3** |
| M1 · M2 앞 턴에 영어를 요청한 뒤 한국어로 후속 질문 | 영어 | 0/6 | **6/6** |
| M3 앞 턴에 영어를 요청한 뒤 「이제 한국어로 답해줘」 | 한국어 | 3/3 | 3/3 |
| M4 요청 없이 한국어로 대화하다가 영어로 질문 | 한국어 | 3/3 | 3/3 |
| E1 · E2 · E3 영어 · 일본어 · 중국어 질문(요청 없음) | 한국어 | 9/9 | 9/9 |
| K1 한국어 질문 | 한국어 | 3/3 | 3/3 |
| 사실값(46건 · 최다 원인 41건 · S/N DA22G0284) | 정답 | 전부 | 전부 |
| 배터리 31문항 : 기대 출처 모두 인용 | 28/28 | 28/28 | 28/28 |
| 배터리 : 무자료 문항 인용 · 한국어 답 | 0/3 · 31/31 | 0/3 · 31/31 | 0/3 · 31/31 |

원본 기록 : [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/438/evidence/before/lang-measure.txt) · [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/438/evidence/after/lang-measure.txt)

답 원문은 고객 가명이 들어 있어 저장소 밖 QA 폴더(`results/2026-10-23-438/`)에 두었다.

## 변경 파일

- `backend/src/main/java/com/ragchatbot/openai/OpenAiRealService.java` — 지시문 마지막 줄, Javadoc 에 근거와 실측
- `backend/src/test/java/com/ragchatbot/openai/OpenAiRealInstructionsTest.java` — 지시가 요청 본문에 실리는지 확인하는 테스트 1건
- `docs/02_architecture/backend.md` 지시문 절 · `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env`(백엔드 하한 357 → 358)

## 검증

- `bash scripts/check-all.sh` 통과 : 백엔드 358 · 프론트 210([기록](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/438/evidence/after/check-all.txt))
- shellcheck · gitleaks · trivy 는 로컬에 없어 돌리지 않았다. 셋 다 CI 에서 돈다
- 리뷰(sonnet) : COMMENT(머지 가능). 지적은 다음처럼 처리했다
  - 다중 턴 동작이 정해져 있지 않다 → 결정을 받아 문구 한 줄과 M1~M4 실측을 더했다
  - CHANGELOG 문장이 끊겨 있었다 → 고쳤다
  - 「한국어로 쓴 요청」이 측정되지 않았다는 지적 → E6 이 바로 그 경우(한국어 질문 + 「일본어로 답해줘」)라 따로 재지 않았다

## 남은 이슈

- 「이 알람 내용을 영어로 번역해줘」처럼 답 언어 요청인지 번역 작업인지 모호한 경우는 재지 않았다. 어느 쪽이든 사용자가 요청한 언어로 답하게 된다
