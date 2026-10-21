## 작업 리포트 — #382 vite 8.1.6 으로 올려 CI deps-frontend 를 푼다

브랜치 `chore/382-vite-816-audit`

### 변경
- `frontend/package-lock.json` 의 vite 8.1.5 → **8.1.6**(advisory 셋의 첫 패치 버전). `package.json` 범위 `^8.1.1` 안이라 **lock 3줄만** 바뀌었다 — 선례 #195 와 같은 방식
- CHANGELOG [Unreleased] Security
- 같은 8.1 이라 README 의 「Vite 8.1」 등 문서 버전 주장은 그대로

### 증거

| 측정 | 전 (8.1.5) | 후 (8.1.6) |
| --- | ---: | ---: |
| `npm audit --audit-level=high` high 취약점 | 1 (vite · launch-editor 3건) | **0** |
| exit | 1 | **0** |

- 원본 : `.issue/382/evidence/before/audit.txt` · `after/audit.txt`

### 검증
- `bash scripts/check-all.sh` 전부 통과 · 백엔드 315 / 315 · 프론트 186 / 186(lint · test · build 포함) → `after/check-all.txt`

### 남은 이슈
- 이 PR 을 먼저 merge 한 뒤 #379 · #380 · #381 · #378 PR 을 main 위로 다시 올려 CI 를 다시 돌린다
