Refs #489

## 요약 — 브랜치 `fix/489-retract-question-on-early-disconnect` (커밋 0592836 · 3008fa4 · 3c20b7a · 통합 e3ab7e5)

### 바꾼 것

- **서버** : 끊김(`ClientGoneException`)에서 보낸 토큰이 0개이고 서버 타임아웃이 아니면 방금 저장한 질문 행을 지우고 첨부 연결을 푼다 — 한 트랜잭션, 질문 행을 먼저 잠그고(대화 삭제 cascade 와 같은 순서) 첨부 연결 해제 → 질문 삭제(첨부 행 보존 · FK cascade 회피). 토큰을 하나라도 보냈으면 지금처럼 stopped 부분 답, 첫 토큰 전 서버 타임아웃(#359)은 error 행 그대로. 지우기 실패는 WARN
- **프론트** : 「저장됨」인데 질문 뒤 답 행이 없으면 400ms 간격 · 마감 5초(요청당 3초 제한)로 이력을 다시 본다 — 질문이 사라지면 「없음」(글 · 카드 되돌림, 새 대화는 조건부 삭제 재시도), 답 행이 생기면 저장됨. 200 뒤 토큰 0개로 끝난 턴(사용자 중단 · 네트워크 절단)도 같은 판정. 판정 중 대화를 옮기면 기존 대화는 판정을 멈추고 옮겨 간 화면의 잠금 · 「확인 중」 표시(#483 `settling`)를 푼다. 재확인 중 401 은 즉시 종료
- 문서 : api.md 채팅 절(걷힌 첨부의 회수 유예 포함) · backend.md · erd.md · frontend.md 「스트리밍 UI 규칙」 · 「남은 한계」

### 검증

- 백엔드 `ChatEarlyDisconnectTest`(TC-CHAT-001 meta 직후 RST 끊김 → 질문 0행 · 첨부 연결만 풀림 · updated_at 그대로 / TC-CHAT-002 토큰 3개 뒤 → 질문 + stopped 답). 고치기 전 TC-CHAT-001 실패 확인. 관련 13클래스 82건 통과 · 연속 3회 안정
- 프론트 useChat 재확인 · 판정 경로 · 대화 이동 · 401 테스트(각 단계 고치기 전 실패 확인) · 통합 뒤 282/282
- 리뷰 : opus 1회 — MED 3(비중단 끊김 · 판정 중 대화 이동 · 감지 지연) 중 2건 반영, 1건은 배포 뒤 운영 실측으로 판단

### 증거

[before/ChatEarlyDisconnectTest.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/489/evidence/before/ChatEarlyDisconnectTest.txt) · [after/ChatEarlyDisconnectTest.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/489/evidence/after/ChatEarlyDisconnectTest.txt) · [before/useChat-recheck.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/489/evidence/before/useChat-recheck.txt) · [before/useChat-review.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/489/evidence/before/useChat-review.txt) · [after/useChat-review.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/489/evidence/after/useChat-review.txt) · [after/related-tests.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/489/evidence/after/related-tests.txt)

### 미측정 · 한계

- **운영 감지 지연 미측정** : 서버는 끊김을 다음 쓰기에서 안다. FIN 이면 첫 토큰(TTFT)까지 늦어질 수 있고, 재확인 5초를 넘으면 예전처럼 질문이 남은 채 저장됨으로 끝난다 — 배포 뒤 운영 탐침(meta 직후 · 단계 뒤 FIN 끊기)으로 철회까지 걸리는 시간을 재고, 5초를 자주 넘으면 첫 토큰 전 heartbeat 를 후속 이슈로
- 스트림 작업 넘기기 거부(execute 거부 → 5xx) 경로는 질문을 걷지 않는다(후속 후보)

### 배포

- 백엔드 배포 필요 · 프론트 Vercel 자동
