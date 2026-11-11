## 작업 요약 — 주석 · 문서만(동작 변화 없음)

커밋 `1e9762f0`.

| 위치 | 고친 것 |
|---|---|
| `frontend/src/components/chat/MessageList.tsx:14` | 「옛 청크가 사라지거나(SPA 리라이트가 HTML 을 돌려준다)」 → 없는 `/assets/*` 는 404(#702) |
| `MessageListLazyFail.test.tsx:8` | 같은 서술 → 404 · #702 전에는 HTML 이었다 |
| `docs/02_architecture/frontend.md:291` | 「SPA 리라이트를 고정한다」에 「단 `/assets/` 는 뺀다 — 아래 #702」 |
| CHANGELOG `[Unreleased]` #694 | 「15~21ms」 → 폭별 중앙값 표시 · 「(#692 와 합친 실측)」 → 「(411 은 #692 뒤 실측)」 · Docs 항목 |

## 근거 · 검증(캡처 대신 — 화면 · 동작 변화 없음)

- 운영 `curl -sI /assets/nonexistent-zzz.js` : `404 Not Found` · `text/plain` (`before/prod-missing-asset.txt`) — 고친 주석이 이 사실과 맞다
- vitest 426 passed(종료 코드 0, 그대로) · lint · docs 검사
- diff : `after/diff.txt`(CHANGELOG 제외)
