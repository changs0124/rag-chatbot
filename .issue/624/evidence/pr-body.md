**변경** — 관리 문서 폴링 요청을 15초(`POLL_TIMEOUT_MS`)로 끊는다. `listDocuments(signal?)` · `pollDocuments` 만 `AbortSignal.timeout` 을 건다. 응답 없는 요청이 #615 의 진행 중 표시를 붙잡아 폴링이 멈추던 길을 막는다

**before / after** — 새 케이스가 `main` 코드에서 실패(`.issue/624/evidence/before/test.txt`) → 통과

**문서** — CHANGELOG [Unreleased] Fixed · case-floors FRONTEND_MIN 337 → 338

**비판 리뷰(opus)** — proceed

## 검증
- main 을 합친 뒤 lint · vitest 338 passed · build 통과

관련 이슈 #624 (통합 테스트 뒤 close)
