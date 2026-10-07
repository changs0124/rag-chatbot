## 작업 요약

터널 토큰을 환경변수 대신 **파일**로 넘기도록 바꾸고 운영에 적용했습니다. 이제 `docker inspect` 출력과 `config.v2.json` 에 토큰이 없습니다. 방식은 `cloudflared --token-file` + compose `secrets`(파일)이고, 고정 이미지(2026.9.1)가 이 플래그를 지원합니다.

## 운영 전후 (값은 가리고 키·길이만)

| 항목 | 전 | 후 |
| --- | --- | --- |
| `Config.Env` | `TUNNEL_TOKEN=<184자>` · PATH · SSL_CERT_FILE | PATH · SSL_CERT_FILE (**토큰 없음**) |
| `config.v2.json` 안 토큰 문자열 | **1줄 일치** | **0** |
| `Config.Cmd` | `tunnel --no-autoupdate run` | `… run --token-file /run/secrets/tunnel_token` |
| 마운트 | 없음 | `secrets/tunnel_token → /run/secrets/tunnel_token` (읽기 전용) |
| 터널 연결 | 4 | **4** (새 컨테이너 기준) |
| `api.chseong.fyi/api/health` | 200 | 200 |
| 서버 `.env` 의 `TUNNEL_TOKEN` 줄 | 1 | 0 (지우기 전 사본 `.env.bak-203`, 600) |

재생성한 것은 cloudflared 하나뿐이고, app·db 는 그대로였습니다(app 57분 · db 3시간 가동 중). 끊긴 시간은 수 초입니다. 연결이 4개가 안 되면 이전 compose 로 자동으로 되돌리게 해 두고 적용했는데, 되돌릴 일은 없었습니다.

## 권한 조합이 보통의 비밀 파일과 다릅니다 — 실측으로 정했습니다

swarm 이 아닌 compose 의 secrets 는 **바인드 마운트**라 `uid`·`mode` 지정이 먹지 않고, 호스트 파일의 권한이 그대로 보입니다. cloudflared 는 65532 로 돌기 때문에 이렇게 갈립니다(운영 VM 의 임시 디렉터리, 가짜 토큰, 같은 이미지·하드닝).

| 파일 권한 | 결과 |
| --- | --- |
| **644** (700 디렉터리 안) | 파일을 읽음 → `Provided Tunnel token is not valid.`(가짜라 정상) |
| 600 (음성 대조) | `Failed to read token file: … permission denied` |
| 파일 없음 | compose 가 기동 전에 멈춤 (`bind source path does not exist`) |

그래서 **파일 644 · 디렉터리 `secrets/` 700** 으로 정했습니다. 호스트의 다른 사용자는 700 디렉터리에 막혀 경로부터 들어오지 못합니다.

## 변경 파일

- `docker-compose.yml` — cloudflared `environment` 제거, `--token-file` + `secrets`, 최상위 `secrets.tunnel_token`(이유 주석)
- `scripts/deploy.sh` — 프리플라이트 `tunnel_secret` : 파일이 없으면 **빌드 전에** 중단 · 디렉터리 700 고정 · `.env` 에 옛 값이 남아 있으면 경고 (운영에서 함수를 떼어 실행해 `secrets/ 권한 700 (정상)` 확인)
- `.env.example` — `TUNNEL_TOKEN=` 줄을 파일 안내로 바꿈
- `.gitignore` — `secrets/`
- `docs/02_architecture/backend.md` — 배포 절차 3번 · 「터널 토큰은 파일로 넘긴다」 · 이전 절차
- `CHANGELOG.md` — Security

## 검증

- `docker compose config -q` 통과, 렌더 결과에서 `TUNNEL_TOKEN` 환경변수가 사라지고 `--token-file` · secrets 마운트만 남은 것 확인
- shellcheck(`koalaman/shellcheck:stable`) `deploy.sh` 경고 0 · `check-all.sh docs` 통과

## 증거

| 파일 | 내용 |
| --- | --- |
| `before/00-runtime.txt` | 적용 전 운영 : Env 키에 토큰 · config.v2.json 평문 1줄 |
| `after/01-mount-probe.txt` | 644 / 600 / 없음 세 경우 |
| `after/02-production.txt` | 운영 적용 로그 · inspect · 프리플라이트 |

## 남은 것 · 주의

- **운영 compose 가 이 브랜치 버전**입니다(main 과 cloudflared 부분만 다름). merge 전에 다른 브랜치로 `deploy.sh` 를 돌리면 옛 compose 가 올라가 `TUNNEL_TOKEN` 환경변수를 다시 찾다가 **기동에 실패**합니다 — 이 PR 을 먼저 merge 하거나 함께 통합해야 합니다
- **로컬 데모 경로**(메인 폴더의 `.env` 에 토큰)도 merge 뒤에는 `secrets/tunnel_token` 파일이 있어야 cloudflared 가 뜹니다
- 서버의 `.env.bak-203` · `.env.bak-20261006` 에 옛 토큰이 남아 있습니다(600). 필요 없으면 지워도 됩니다
- JWT 서명키 · OpenAI 키 · DB 비밀번호는 여전히 env 입니다(이 이슈 범위 밖)
