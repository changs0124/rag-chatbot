## 작업 요약

Cloudflare 공지(서드파티 인증서 손상, 2026.10.2 이상 요구)에 맞춰 운영 compose 의 cloudflared 고정 이미지를 **2026.10.0 → 2026.10.5** 다이제스트로 올렸다. 하한 2026.10.2 대신 현재 `latest` 와 같은 최신 패치를 골랐다(#215 와 같은 기준).

설정 변경이라 화면 캡처 대신 명령 출력으로 전후를 남긴다 — [before.txt](before.txt) · [after.txt](after.txt)

## 변경 전후

| 항목 | 전 | 후 |
| --- | --- | --- |
| 고정 다이제스트 | `sha256:9b49eed8…` | `sha256:1b1d34d0…` |
| `--version` | 2026.10.0 (10-05 빌드) | **2026.10.5** (10-27 빌드) |
| 레지스트리 태그 | `2026.10.0` | `2026.10.5` = `latest` |
| `--token-file` · `--no-autoupdate` | 지원 | 지원 |
| 실행 사용자 | `65532:65532` | `65532:65532` (#203 secrets 권한 그대로) |

## 변경 파일

- `docker-compose.yml` — cloudflared `image:` 다이제스트 · 「2026.10.x 에서 확인」 주석
- `docs/06_changelog/CHANGELOG.md` — `[Unreleased]` Security 항목

## 검증

- `docker compose config` 통과(새 다이제스트로 해석)
- `bash scripts/check-all.sh docs` 통과(shellcheck 미설치로 1건 건너뜀 — CI 에서 돈다)

## 남은 일

- merge 뒤 운영 재배포 → 컨테이너 버전 · 터널 healthy(엣지 4) · `/api/health` 200 · `Config.Env` TUNNEL 0건 · 대시보드 커넥터 버전 2026.10.5 확인
