## 작업 리포트 — #215

**이미지 고정값과 문서만 바뀌어서 화면 캡처는 생략했다.** 대신 레지스트리 다이제스트 대조, 새 이미지를 직접 실행한 결과, compose 검증 결과를 전후 텍스트로 남긴다(`before.txt` · `after.txt`).

### 바꾼 것 (커밋 `c6bf95b`, 브랜치 `chore/215-cloudflared-2026-10-0`)

| 위치 | 전 | 후 |
|------|----|----|
| `docker-compose.yml:193` | `cloudflared@sha256:b269e8ab…` (2026.9.1) | `cloudflared@sha256:9b49eed8…` (2026.10.0) |
| `docker-compose.yml:199` · `backend.md:544` | 고정한 이미지(2026.9.1) | 고정한 이미지(2026.10.0) |
| `CHANGELOG.md` | — | Security 항목 추가 |

### 확인한 것

- 레지스트리 : `2026.9.1` → `b269e8ab…`(기존 고정값과 일치), `2026.10.0` 과 `latest` → 둘 다 `9b49eed8…`(멀티아키 인덱스)
- 새 이미지 실행 : `cloudflared version 2026.10.0`, `--token-file` · `--no-autoupdate` 지원
- 실행 사용자 : 이전 이미지와 새 이미지 모두 `65532:65532` 라서 #203 의 secrets 권한(파일 644 · 디렉터리 700)을 그대로 쓴다
- `docker compose config`(예시 env) 통과, `check-all.sh docs` 통과
- `2026.9.1` · `b269e8ab` 잔존 0건(CHANGELOG 제외)

### 운영 반영 (아직 안 함)

merge 뒤 사용자 확인을 받고 `deploy.sh` 로 재배포한다. 확인할 항목 : 컨테이너 버전 2026.10.0 · 터널 healthy(엣지 4) · `/api/health` 200 · `Config.Env` 에 TUNNEL 0건.
