## #651 gitleaks 목업 토큰 오탐 — 전후

`.gitleaks.toml` 허용 목록에 목업 토큰 `h.eyJzdWIiOiJ1MSJ9.s` **하나만** 정확히(`^…$`) 넣었다. 규칙 · 경로는 그대로.

| 스캔(gitleaks 8.30.1, CI 와 같은 `git . --redact`) | 전 | 후 |
|---|---|---|
| main 전체 히스토리(1,203 커밋) | leaks 8 (generic-api-key, 캡처 스크립트 4개 × 브랜치 · 미러) | 0 |
| #642 · #643 · #644 · #645 브랜치 | 각 실패 | 각 0 |
| 음성 대조 : 한 글자 바꾼 토큰(`…J1MiJ9.s`) | — | 여전히 1건 잡힘 |

원자료 : `before/gitleaks-main.json`(값은 REDACTED) · `after/gitleaks-main.txt` · `after/gitleaks-branches.txt`
