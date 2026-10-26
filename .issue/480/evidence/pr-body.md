Refs #480

## 요약 — 브랜치 `fix/480-early-failure-giveback` (커밋 659754b · a4e6398)

### 바꾼 것

- `useChat` catch : 200 전(`!opened`)이면 중단 여부와 무관하게 정리(질문 말풍선 걷기 · giveBack · 빈 새 대화 정리)
- 4xx(400~499) 는 저장 전 거절이 확실해 판정 없이 되돌림. 5xx · fetch 실패는 `judgeEarlyAbort` 로 서버에 물음(질문 커밋 뒤에도 500 이 날 수 있고 Cloudflare 502 는 저장 여부를 모름)
- 429 · 5xx · 네트워크는 글 + 카드, 그 밖 4xx 는 **글만**(카드가 거절 원인일 수 있어 같은 오류 반복을 막음)
- 기존 대화 404 는 이력도 404 일 때만 「지워진 대화」로 보고 목록에서 뺌 · 401 은 판정 생략 · 비중단 실패가 「저장됨」이면 오류 답 말풍선을 붙임(#487 실측 반영 — 서버는 답을 만들지 않는다)
- fetch 실패도 상단 오류 배너 · frontend.md 「스트리밍 UI 규칙」 · 「남은 한계」

### 검증

- useChat 9건 · Composer 1건 추가(429 · 400 · fetch 실패 · 502 저장됨 · 404 두 갈래 · 401 · 판정 중 대화 이동 · deleteIfEmpty 실패 · 글만 되돌리기). 고치기 전 실패 확인. 프론트 232/232
- 리뷰 : opus 리뷰 MED 2(#487 전제 · 첨부 4xx 루프) · LOW 4 → 모두 반영

### 증거

[before/useChat-480-tests.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/480/evidence/before/useChat-480-tests.txt) · [after/useChat-480-tests.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/480/evidence/after/useChat-480-tests.txt) · [before/useChat-480-review-tests.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/480/evidence/before/useChat-480-review-tests.txt) · [after/useChat-480-review-tests.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/480/evidence/after/useChat-480-review-tests.txt) · [after/useChat-catch-grep.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/480/evidence/after/useChat-catch-grep.txt)

### 미측정 · 한계

- **화면 캡처 미측정** — 로컬 백엔드 + 동시 스트림 429 를 만드는 캡처는 아직. merge 뒤 운영 화면에서 확인 예정

### 배포

- 프론트(Vercel 자동)

> 10-26 전체 리뷰 후속(#479~#488). 통합은 issue-merge 에서 순서대로 · 이슈는 통합 검증 뒤 닫는다.
