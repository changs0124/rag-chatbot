**변경** — 판정의 첫 요청 전에도 계정(토큰 `sub`)을 본다(`judgeEarlyAbort` 맨 앞 · 거절 404 분기). 로그아웃은 토큰을 먼저 지우고 끊으므로 첫 요청이 토큰 없이 나가 401 을 받던 것을 막는다. frontend.md 「남은 한계」 두 줄 갱신

**before / after** — 새 케이스가 `main` 코드에서 실패(첫 요청 1개, `.issue/626/evidence/before/test.txt`) → 통과

**문서** — frontend.md · CHANGELOG [Unreleased] Fixed · case-floors FRONTEND_MIN 339 → 340

**비판 리뷰(opus)** — proceed

## 검증
- main 을 합친 뒤 lint · vitest 340 passed · build 통과

관련 이슈 #626 (통합 테스트 뒤 close)
