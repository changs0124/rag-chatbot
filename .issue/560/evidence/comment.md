## #560 리포트 — CHANGELOG 11-02 구획 마감

성격 : 문서만(동작 변화 없음).

- `## [Unreleased]` 아래 내용을 `## [2026-11-02]` 로 옮기고 새 빈 `[Unreleased]` 를 뒀다
- 구획 머리 문단 : 배포 `9465e0e` → `4d5b084` · 롤백 `prev-9465e0e`=4002b4a3 · 터널 경유 첫 배포(cloudflared 재생성 없음 · 헬스 10초 · 터널 0초) · 배포 뒤 스모크(GET/HEAD health 200 · 미인증 chat 401 · /error 401 · nosniff/DENY · WARN/ERROR 0) · 실린 백엔드 코드 변경은 #542 문구 한 줄
- 소절 4개에 배포 라벨 `(4d5b084)` — `[2026-10-28]` 형식과 같다

before : `.issue/560/evidence/before/unreleased-head.txt` · after : `.issue/560/evidence/after/section-head.txt`

검증 : `bash scripts/check-all.sh docs` 통과
