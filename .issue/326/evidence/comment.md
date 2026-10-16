## 작업 요약

채팅 스트림이 타임아웃되거나 도중에 실패하면, 그 예외가 범용 예외 처리기(`@ExceptionHandler(Exception.class)`)로 갔다.
- 처리기는 응답이 이미 커밋됐는지 보지 않고 ERROR 로그를 남긴 뒤 500 JSON 을 쓰려 했다
- 실제로는 그 쓰기가 실패하며 연결이 끊겼다. 클라이언트는 깔끔한 스트림 종료 대신 `chunked transfer encoding` 오류를 받았다

이렇게 고쳤다.
- **타임아웃** : 전용 처리기가 WARN 한 줄(「비동기 요청 타임아웃」)만 남긴다. 커밋 뒤면 본문을 쓰지 않고, 커밋 전이면 503 `SERVICE_UNAVAILABLE` 을 준다
- **도중 오류** : 진짜 원인을 남기는 유일한 서버 기록이라 ERROR 로그는 유지한다. 커밋 뒤면 본문을 쓰지 않는다
- 두 처리기 모두 `void` 가 아니라 null `ResponseEntity` 를 돌려준다. `void` 는 기본 뷰 렌더링으로 빠진다
- 「SSE 도중 오류는 여기 오지 않는다」던 틀린 javadoc 도 고쳤다

## 검증

| 항목 | 전 | 후 |
| --- | --- | --- |
| TC-OPS-025 타임아웃(실 Tomcat, 원시 바이트 확인) | ERROR 로그 · `HttpMessageNotWritable` | **WARN 한 줄, 스트림에 JSON 없음** |
| TC-OPS-026 도중 오류 | 연결 끊김(`IOException`) | **`event: error` 로 깔끔히 종료, ERROR 로그 유지** |
| TC-OPS-027 처리기 직접 호출(커밋 전 503 · 커밋 뒤 본문 없음) | — | **통과** |
| `GlobalExceptionFallbackTest`(일반 요청 회귀) | 14 통과 | **14 통과** |
| 백엔드 전체(main #327 · #328 반영 후) | 294 | **297 통과** |

- 리뷰 : APPROVE. 반영한 것
  - 타임아웃 스텁을 `CountDownLatch` 로 붙잡아, 테스트보다 오래 사는 스레드를 없앴다. 클래스 타임아웃은 2초로 늘렸다
  - 폴백 500 행에 「커밋 뒤면 본문 없음」을 적었다
  - 로그 문구를 바꿨다
- 원본 : `.issue/326/evidence/`

## 이슈와 다른 점

- **`@DirtiesContext` 를 쓰지 않았다.** 이 클래스는 자기 Spring 컨텍스트가 필요하다
  - 처음에는 공유 테스트 DB 의 연결이 모자라 「too many clients」가 났고, 그래서 `@DirtiesContext` 를 붙였다
  - 그런데 리뷰를 반영한 뒤 그 클래스 다음에 도는 테스트 클래스가 기동에 실패했다
  - 그래서 `@DirtiesContext` 대신 이 클래스만 연결 풀을 2로 줄였다

## 변경 파일

- `backend/.../exception/GlobalExceptionHandler.java`
- `ChatStreamExceptionHandlerTest.java`(새로 만듦)
- `docs/02_architecture/backend.md` 「예외 → 상태 매핑」
- `docs/01_specs/api.md` : `SERVICE_UNAVAILABLE` 503 행. 지금 이 응답에 닿는 경로는 없다고 적었다
- CHANGELOG
- `scripts/case-floors.env` : 백엔드 하한 294 → 297(실측)

## 남은 이슈

- 리뷰 제안(원인이 달라 별도 이슈로 다룬다)
  - 통합 테스트 컨텍스트가 공유 PostgreSQL 연결 상한 가까이에 있다. 컨텍스트 9개 × 풀 10 이 상한 97 에 육박한다
  - `TC-OPS-020~023` 번호가 두 테스트 파일에서 겹친다
