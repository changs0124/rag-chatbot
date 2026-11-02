## #553 리포트 — `response.incomplete` 를 잘린 완료로 저장

`OpenAiRealService` — `response.completed` 와 같은 분기에서 `response.incomplete` 도 받는다(같은 `response` 객체를 싣고 온다). 인용 · 사용량을 뽑아 정상 저장하고, 사유를 WARN 한 줄로 남긴다 : `openai response incomplete reason=max_output_tokens|content_filter`.

- 사용자 · DB : 정상 완료와 같다 — SSE `citations` → `done{finishReason:stop}`, `status=complete` · `stopped=false`, 인용 · 사용량 저장 → 다음 턴 이력에도 들어간다
- `stopped` 는 「출처 판정을 못 마침」이라 뜻이 달라 재사용하지 않았다

테스트(`OpenAiRealStreamIncompleteTest` 새 파일 2건 : `max_output_tokens` · `content_filter`)
- before : 2건 모두 「완료(response.completed) 없이 종료됨」 예외 — `.issue/553/evidence/before/test.txt`
- after : `*OpenAi*,*Chat*` 133건 통과 — `.issue/553/evidence/after/test.txt`

문서 : `api.md` `done` 행 · `live-integration.md` 가정 B.

**남은 한계** : 화면에 「잘렸다」 표시는 없다(사유는 서버 로그에만). 이벤트 모양은 API 문서 기준이고 운영에서 실제로 받아 본 적은 없다 — 운영 로그에 WARN 이 찍히면 그때 모양을 대조한다.
