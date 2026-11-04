## #591 리포트 — 문서 3곳 · 주석 3곳

코드 동작 변화 없음(문서 · 주석만). 캡처 대신 변경 근거를 글로 남긴다.

**문서** — `docs/01_specs/live-integration.md`
- 4절 비용 표 「검색 툴 호출 — 대화 턴마다 1회 붙는다」 → 「턴마다 도구가 붙고, 호출 여부 · 횟수는 모델이 정한다(턴당 7~20회 관측, 3-3 #431). 호출 한 건마다 과금」 — 같은 문서 3-3 #431 · 3-2 `tool_choice` 미전송과 모순이던 것
- 3-2 「지시문 줄별 실측」 머리말에 날짜 줄(`DATE_LINE`, #533) 병기 — #533 행이 `RAG_INSTRUCTIONS` 의 줄이 아니라서
- 2-3 업로드 400 문구 인용을 코드(`AdminDocumentService.java:134`)대로 ` (OPENAI_VECTOR_STORE_ID)` 까지

**주석**
- `OpenAiRealService.RAG_INSTRUCTIONS` : 「고정 지시. 요청마다 끝에 날짜 줄이 더 붙는다」
- `OpenAiRealService.DATE_LINE` : 범위 — 스토어가 없는 턴은 지시문을 싣지 않아 날짜도 없다(사용자 결정, [#105 판정](https://github.com/changs0124/rag-chatbot/issues/105#issuecomment-6622800968))
- `OpenAiRealTestSupport` : 낡는 「위치 인자 8개」(지금 9개) → 숫자 삭제
- `ChatService.truncateToBudget` 의 `(#554 · #575)` 는 #584 에서 이미 고쳤다

**검증** — `./mvnw verify` 437/437 · `check-all.sh docs` 통과
**배포** — 다음 백엔드 배포에 주석만 실림(동작 변화 없음)
