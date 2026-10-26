Refs #487

## 요약 — 브랜치 `docs/487-client-gone-measure` (커밋 93f8ee5 · 1f766d8)

### 바꾼 것

- frontend.md 「스트리밍 UI 규칙」 · 「남은 한계」 · useChat.ts 주석 · backend.md 「저장 텍스트」 · ChatService.java:248 주석(전송에 성공한 만큼)
- 답 없는 질문이 남는 증상은 **#489**(서버가 질문을 걷음, 사용자 결정)에서 고친다

### 검증

- 실측 — 로컬 목업 + 원시 소켓 시나리오 3 × 끊기 2(FIN/RST) × 5회, 운영(Cloudflare → cloudflared → Tomcat, 실 OpenAI) 시나리오 3 × 5회. 30 + 15회 모두 「답을 끝까지 만든」 회차 0
- 리뷰 : sonnet 리뷰 REVISE(운영 미측정 · 단정) → 운영 실측으로 해소 · MINOR 4 반영

### 증거

[after/probe-table.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/487/evidence/after/probe-table.txt) · [prod/probe-prod.jsonl](https://github.com/changs0124/rag-chatbot/blob/main/.issue/487/evidence/prod/probe-prod.jsonl) · [prod/probe487prod.py.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/487/evidence/prod/probe487prod.py.txt) · [Issue487ProbeTest.java.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/487/evidence/Issue487ProbeTest.java.txt) · [before/doc-claims.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/487/evidence/before/doc-claims.txt) · [after/doc-claims.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/487/evidence/after/doc-claims.txt)

### 미측정 · 한계

- 운영 (a) 보내자마자 끊기는 Cloudflare 가 앱에 넘기지 않아 질문도 저장되지 않음 — 질문 저장 후 200 전 수 ms 구간은 일부러 만들지 않음

### 배포

- 없음

> 10-26 전체 리뷰 후속(#479~#488). 통합은 issue-merge 에서 순서대로 · 이슈는 통합 검증 뒤 닫는다.
