## #570 리포트 — CHANGELOG 11-02 2차 배포 구획 마감

성격 : 문서만.

- 같은 날 두 번째 배포라 날짜 구획을 나누지 않고 `[2026-11-02]` 머리 문단을 「운영 배포 2회 — **2차** … / **1차** …」로 고쳤다
- `[Unreleased]` 의 Docs · Tests · Fixed 소절을 `(1b88930)` 라벨로 옮겨 1차 `(4d5b084)` 소절 위에 뒀다 · 새 빈 `[Unreleased]`
- 2차 머리 : 롤백 `prev-4d5b084`=5669bb44 · 마이그레이션 없음 · cloudflared 재생성 없음(배포 전 `--dry-run`) · 헬스 10초 · 터널 0초 · 스모크(GET/HEAD health 200 · 미인증 chat 401 · /error 401 · nosniff/DENY · WARN/ERROR 0) · 프론트 #556~#558 은 merge 때 Vercel 반영 · 첫 시도는 PC Docker 컨텍스트 파일 잠금으로 빌드에서 멈춤(서버 무변경)

before / after : `.issue/570/evidence/before/head.txt` · `after/head.txt` · 검증 `check-all.sh docs` 통과
