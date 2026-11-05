**변경(문서 · 주석만)** — 동기화 주석 위치 표현(「아래」→「위」) · 유예 「약 95초」의 계산 근거(6 × (T + 연결 5초) + 재시도 간격 약 1.8초, 5xx · 429 기준) · `api.md` API-POST-009 규칙 안내에 #612 · #613 을 더함. 동작 변화 없음

**before / after** — `.issue/628/evidence/before/lines.txt` · `after/doc-diff.txt`

**문서** — CHANGELOG [Unreleased] Docs

**비판 리뷰(opus)** — revise(재시도 간격 3.6초 → 1.8초 · 연결 타임아웃 전제 · CHANGELOG 누락) → 반영

## 검증
- 백엔드 compile · 문서 검사 4종 통과

관련 이슈 #628 (통합 테스트 뒤 close)
