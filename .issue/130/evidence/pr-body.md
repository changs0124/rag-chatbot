관련 이슈: [#130 security(deploy): 컨테이너 하드닝·로그 회전·비밀 취급을 보강한다](https://github.com/changs0124/rag-chatbot/issues/130) (통합 테스트 뒤 close)

세 컨테이너가 Docker 기본 capability 14개를 그대로 들고 돌았고 `security_opt` · `cap_drop` ·
`read_only` · `pids_limit` 이 **하나도 없었다.** 단일 VM 에 전부 모으는 구성이라 침해 하나가
전부를 먹는 형태였다. `db` · `cloudflared` 로그는 **무제한**이라 `pgdata` 와 같은 디스크를 채우면
DB 가 먼저 멎을 수 있었고, `cloudflared` 이미지는 `latest` 로 떠 있었다.

**이슈의 5개 항목 중 둘은 지금 판정할 수 없어 남겼다.** 사유는 아래에 적었고 이슈는 열어 둔다.

## 변경 내용

- `docker-compose.yml`
  - `no-new-privileges` — 세 서비스 전부
  - `cap_drop: ALL` — `app`(추가 없음, **capability 0개**) · `cloudflared` 전면,
    `db` 는 실측으로 좁힌 4개만 복원(`DAC_OVERRIDE` · `FOWNER` · `SETUID` · `SETGID`)
  - `app` `read_only: true` + `/tmp` tmpfs 64m
  - `pids_limit` — `db` 128 / `app` 256 / `cloudflared` 64
  - `db` · `cloudflared` 로그 회전 신규 (10m × 3)
  - 네트워크 분리 — `backend`(db↔app) / `edge`(app↔cloudflared)
  - `cloudflared` 이미지 다이제스트 고정
- `scripts/deploy.sh` — 프리플라이트가 서버의 `.env` 권한을 600 으로 고정
- `docs/02_architecture/backend.md` — 「상시 공개 - 자체 호스팅 서버」에 위 내용과 근거,
  `docker inspect` 출력 공유 금지
- `docs/06_changelog/CHANGELOG.md` — Added · Changed

## 전후

| 항목 | 전 | 후 |
| --- | --- | --- |
| `no-new-privileges` | 없음 | 셋 다 |
| `cap_drop` | 없음 (기본 14개) | `app` 0개 / `db` 4개 / `cloudflared` 0개 |
| `read_only` | 없음 | `app` + `/tmp` tmpfs 64m |
| `pids_limit` | 없음 | 128 / 256 / 64 |
| 로그 회전 | `app` 만 | 셋 다 |
| 네트워크 | 기본 하나에 셋 다 | `backend` / `edge` |
| `cloudflared` 이미지 | `:latest` | `@sha256:b269e8ab…` |
| 서버 `.env` 권한 | 확인 안 함 | `deploy.sh` 가 600 고정 |

커널이 실제로 들고 있는 capability (`/proc/1/status` 의 `CapBnd`) :

```text
before   db 00000000a80425fb · app 00000000a80425fb
after    db 00000000000000ca · app 0000000000000000
```

## 검증

완료 조건 1번은 「VM 을 켜고 한 항목씩」인데 `free-vm` 은 `TERMINATED` 다.
**`scripts/deploy.sh:114` 가 저장소의 `docker-compose.yml` 을 그대로 서버로 scp** 하므로
로컬과 운영이 같은 파일·같은 이미지를 쓴다. 그래서 로컬에서 한 항목씩 적용해 확인했다.
A~F 6단계 전부 `db`·`app` healthy, `app /api/health` 200, 재시작 0회.
**남은 차이는 커널이다**(Docker Desktop ↔ Ubuntu) — 배포 때 한 번 더 확인해야 한다.

함정 셋을 피했다.

- **기존 볼륨으로 시험하면 거짓 통과한다.** 깨지는 자리가 postgres **초기화 경로**인데 초기화가
  끝난 `pgdata` 는 그 경로를 타지 않는다. 항목마다 `down -v` 로 볼륨을 버려 초기화를 실제로 태웠다.
- **`read_only` 를 healthcheck 로 확인하면 안 된다.** `/api/health` 는 업로드 경로를 타지 않아
  첨부 저장이 깨져도 healthy 로 보인다. `/data/uploads` 쓰기 · `/tmp` 쓰기 · 루트 쓰기 거부 ·
  `app.jar` 덮어쓰기 거부를 각각 직접 찔렀다.
- **`db` 의 `cap_add` 는 추측이 아니라 실측이다.** 음성 대조로 이슈의 경고를 먼저 재현하고
  (`cap_add` 를 비우면 `failed switching to 'postgres'`), 하나씩 빼며 좁혔다.
  **`CHOWN` 은 빼도 정상 기동해 넣지 않았다** — 이미지의 data 디렉터리가 이미 postgres 소유라
  신규 named volume 이 그 소유권을 물려받는다. `FOWNER` 는 빼도 healthy 에 닿지만 `chmod` 가
  **조용히 실패**해서(healthcheck 는 통과, 권한만 어긋남) 넣어 두었다.

네트워크 분리는 「막혔다」를 증거로 남겼다 — `edge` 에서 `db` 는 **이름 해석조차 되지 않는다**
(`nc: bad address 'db'`). 동시에 `app:8080` 은 닿고 `app → db` 도 통한다.

게이트는 이렇게 돌렸다.

- `bash scripts/check-all.sh docs` — **전부 통과, 건너뜀 0건**
- **`shellcheck` 를 실제로 돌렸다.** 로컬에 바이너리가 없어 평소 「모름」으로 남는 항목인데,
  `koalaman/shellcheck:stable`(0.11.0)을 PATH 에 얹어 저장소의 `check-shell-lint.sh` 를 그대로
  불렀다 — 10개 통과, **억제(`disable=`) 추가 없음.** 작성 중 SC2016 이 한 번 걸렸는데 억제하지
  않고 `deploy.sh` 가 이미 쓰는 `\$` 이스케이프 방식으로 맞춰 없앴다.
- `docker compose config -q` 문법 정상

`.env` 권한 확인은 **처음에 시험 환경이 거짓말을 했다** — Git Bash(Windows/NTFS)에서는 `chmod` 가
먹지 않아 「고쳤다」고 출력하면서 644 로 남았다. 배포 대상과 같은 리눅스 컨테이너에서 네 경우
(644→600 · 이미 600 · 파일 없음 · 640→600)를 다시 확인했다.

## 범위에서 뺀 것

| 항목 | 사유 |
| --- | --- |
| `memswap_limit`/스왑 (이슈 5번) | 이슈 자체가 「부하를 걸어 보고 정할 것」이라 적었고 근거가 `pd-standard` 30GB 의 **쓰기 45 IOPS** 다. 개발 PC 에서 재현 불가 — 여기서 정하면 근거 없는 숫자가 된다. 배포 후 측정으로 미룬다 |
| `TUNNEL_TOKEN` → Docker secret (이슈 3번 1순위) | 토큰 방식에서 credentials 파일 방식으로 바꾸는 일이라 Cloudflare 대시보드 자료가 필요하다. `docker inspect` 평문 노출은 **아직 열린 문제**이며, 우선 문서에 「출력을 그대로 공유하지 말 것」을 명시했다 |
| `cloudflared` 정상 동작 | `TUNNEL_TOKEN` 이 자리표시자라 crash-loop 한다. 확인한 것은 **(1) 설정이 런타임에 걸렸는가 (2) 실패 원인이 capability 가 아니라 여전히 토큰인가** 둘뿐이다 |
| `postgres:16-alpine` 다이제스트 고정 | 이슈 범위가 `cloudflared` 였다. 이것도 움직이는 태그라 별도 판단 대상 |

## 증거

[전후 리포트 보기](https://github.com/changs0124/rag-chatbot/issues/130#issuecomment-5644641770)

스크린샷은 없다 — 배포 구성이라 앱 화면이 바뀌지 않는다. 대신 `docker inspect` 와
`/proc/1/status` **런타임 실측**을 before/after 같은 형식으로 남겼다. compose 파일을 읽어
「걸었다」고 말하지 않았다. 원본은 `.issue/130/evidence/` (before 1건 / after 7건).

임시 프로브 프로젝트(`rag130probe` · `rag130neg`)와 볼륨은 전부 지웠고,
**보존 중인 로컬 데이터(`rag-chatbot_pgdata` · `rag-chatbot_uploads`)는 건드리지 않았다.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018bBUzct65eWEaZqTgLsri7
