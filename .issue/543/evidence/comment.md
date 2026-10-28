## #543 전후 리포트 — 테스트 헬퍼 중복 · 테스트 클래스 간 의존 정리

구현 커밋 `bc290e9` (브랜치 `fix/543-test-helpers`, 테스트 코드만)

### 바꾼 것
- `OpenAiRealStreamFailureTest` · `OpenAiRealUsageTest` : `against("https://example.invalid/v1", "")` → `parserOnly()`(둘 다 `consumeStream` 만 부르는 파서 경로. 호출이 새면 DNS 대신 localhost:1 에서 즉시 실패)
- `sse()` · `assertJsonError()` : `ChatSseAcceptErrorTest` → `SseTestSupport`(본문 그대로). `ChatSseAcceptRateLimitTest` 가 다른 테스트 클래스에 기대지 않는다(#329 취지)
- openai 테스트 6개(BetaHeader · DeleteDocument · Instructions · StoreFiles · StreamingSpike · UploadDocument)의 가짜 `HttpServer` 생성 · 바인드 · start · 주소 → `OpenAiRealTestSupport.startFakeServer(path, handler)` · `baseUrl(server)`. 핸들러 · 단언 · `@AfterEach stop(0)` 은 그대로
- 프론트 손수 만든 deferred 7곳(useChat 2 · refresh 1 · AdminUsersPage 3 · MyPage 1) → `test/fixtures.ts` `deferred()`. 남은 손수 deferred 0건(정규식 검색)
- `ErrorBoundary.test` : `spy.mockRestore()` 를 테스트 끝 → `onTestFinished`(단언이 실패해도 복원, `useChat.test` 와 같은 관용구)
- CHANGELOG [Unreleased] `### Refactored`

### 증거 — 케이스 · 단언 그대로
테스트 코드만 바뀌어 캡처 대신 수치로 남긴다. [`asserts.sh`](https://github.com/changs0124/rag-chatbot/blob/main/.issue/543/evidence/asserts.sh) 가 테스트 파일마다 케이스 선언 수와 단언 호출 수를 센다.

| | before | after |
|---|---|---|
| 백엔드 `./mvnw verify` | [424/424 · rc=0](https://github.com/changs0124/rag-chatbot/blob/main/.issue/543/evidence/before/verify.txt) | [424/424 · rc=0](https://github.com/changs0124/rag-chatbot/blob/main/.issue/543/evidence/after/verify.txt) |
| 프론트 vitest | 308/308 | 308/308 |
| 케이스 선언 합계 | 710 | 710 |
| 단언 호출 합계 | 1591 | 1591 |
| 파일별 | [asserts.tsv](https://github.com/changs0124/rag-chatbot/blob/main/.issue/543/evidence/before/asserts.tsv) | [asserts.tsv](https://github.com/changs0124/rag-chatbot/blob/main/.issue/543/evidence/after/asserts.tsv) |

파일별 차이는 두 줄뿐이다 — `ChatSseAcceptErrorTest` 단언 4 → 0, `SseTestSupport` 1 → 5(`assertJsonError` 안의 `assertThat` 4개가 옮겨 간 것). 삭제된 단언은 없다. `check-all.sh docs` 통과.
