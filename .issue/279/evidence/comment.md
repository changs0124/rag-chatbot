## 작업 리포트 — #279

브랜치 `fix/279-sse-accept-error-json` · 커밋 `73a0701`

### 원인

`GlobalExceptionHandler` 의 오류 응답(`ApiError`)에 Content-Type 이 정해져 있지 않았다. 그래서 Spring 이 요청의 `Accept` 로 형식을 협상했다. `Accept: text/event-stream` 이면 JSON 객체를 그 형식으로 쓸 변환기가 없어서 핸들러 자체가 실패했고, 빈 본문 500 이 나갔다. 429 만이 아니라 **400 · 404 도 같았다**.

### 무엇을 바꿨나

- `GlobalExceptionHandler` : 모든 오류 응답이 `json(status)` 를 거친다. 이 함수는 `Content-Type: application/json` 을 미리 정해 두고, 그러면 Spring 이 협상을 건너뛴다. 핸들러 14개의 상태 코드와 본문은 그대로다.
- 테스트 3건 추가 : SSE Accept 로 400 · 404 · 429 를 받으면 상태 코드가 그대로이고 JSON 본문이 온다. 변이 확인 : 이 변경을 빼면 3건 모두 실패한다.
- 백엔드 하한 283 → 286(실측), `mvnw verify` 통과
- `api.md` API-POST-005 에 「스트림을 열기 전의 거절은 JSON」 한 단락, CHANGELOG

### 측정 — 로컬 앱, 실제 요청

| 경우 | Accept | 전 | 후 |
| --- | --- | ---: | ---: |
| 빈 메시지 | `text/event-stream` | **500 · 빈 본문** | **400 · JSON** |
| 없는 대화 | `text/event-stream` | **500 · 빈 본문** | **404 · JSON** |
| 같은 사용자 동시 2건 | `text/event-stream` | **500 · 빈 본문** | **429 · JSON** |
| 위 셋 | `*/*` (화면) | 400 · 404 · 429 JSON | 그대로 |
| 로그 `Failure in @ExceptionHandler` | | 4건 | **0건** |

원본(상태 · Content-Type · 본문 앞부분)은 `.issue/279/evidence/` 에 있다.
