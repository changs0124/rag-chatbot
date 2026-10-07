## 작업 리포트

문서·주석만 바뀌는 작업이라 화면 캡처 대신 `grep` 전후를 증거로 남깁니다.

### 변경

| 위치 | before | after |
| --- | --- | --- |
| `scripts/deploy.sh:76-77` 주석 | `.env` 에 `… DB_PASSWORD · TUNNEL_TOKEN` 이 평문 | `… DB_PASSWORD` 가 평문(터널 토큰은 #203 에서 `secrets/` 파일로) |
| `docs/02_architecture/backend.md:531-532` | 같은 문장 | 같은 방향으로 고침 |
| `docs/04_tasks/current-sprint.md:18` | 「`TUNNEL_TOKEN`(Cloudflare 터널 생성) 확보」 | 서버 `secrets/tunnel_token`(파일 644 · 디렉터리 700)에 둔다 + backend.md 「배포」로 연결 |

**그대로 둔 것** — 옛 값을 다루는 문장 : `deploy.sh` 의 「`.env` 에 옛 값이 남으면 경고」(109·123행) · `backend.md` 의 이전 절차(550~557행).

### 완료 기준

- [x] `grep -n TUNNEL_TOKEN` 결과 중 「현재 .env 에 있다」로 읽히는 줄 0 — 남은 6줄은 전부 옛 값 경고·이전 절차
- [x] `bash scripts/check-all.sh docs` 통과 · `bash -n scripts/deploy.sh` OK
- [x] 코드 동작 변경 0 (diff 3파일 · +6 −3, 전부 주석·문서)

### 증거

- before : [`01-grep.txt`](EVIDENCE_BEFORE_URL) (main `622ac88`)
- after : [`01-grep.txt`](EVIDENCE_AFTER_URL) (grep + 전체 diff)

구현 커밋 `78916fb` · 브랜치 `docs/209-issue-209`
