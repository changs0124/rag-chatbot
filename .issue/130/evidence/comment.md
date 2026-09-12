## 작업 요약

세 컨테이너에 하드닝을 넣고, `db` · `cloudflared` 로그 회전을 켜고, `cloudflared` 이미지를
다이제스트로 고정하고, 서버의 `.env` 권한을 `deploy.sh` 가 600 으로 고정하게 했다.
**이슈의 5개 항목 중 둘은 지금 판정할 수 없어 남겼다** — 사유는 아래에 적었고 이슈는 열어 둔다.

## 변경 전후

| 항목 | 전 | 후 |
| --- | --- | --- |
| `no-new-privileges` | 없음 (셋 다) | **셋 다 적용** |
| `cap_drop` | 없음 — Docker 기본 14개 | `app` **0개** / `db` 4개 / `cloudflared` **0개** |
| `read_only` | 없음 | `app` 적용 + `/tmp` tmpfs 64m |
| `pids_limit` | 없음 | `db` 128 / `app` 256 / `cloudflared` 64 |
| 로그 회전 | `app` 만 | **셋 다** (10m × 3) |
| 네트워크 | 기본 하나에 셋 다 | `backend`(db↔app) / `edge`(app↔cloudflared) |
| `cloudflared` 이미지 | `:latest` | `@sha256:b269e8ab…` 고정 |
| 서버 `.env` 권한 | 확인하지 않음 | `deploy.sh` 프리플라이트가 600 으로 고정 |

커널이 실제로 들고 있는 capability (`/proc/1/status` 의 `CapBnd`) :

```text
before   db 00000000a80425fb · app 00000000a80425fb   (Docker 기본 14개)
after    db 00000000000000ca · app 0000000000000000   (app 은 0개)
```

## VM 이 중지돼 있는데 어떻게 검증했나

완료 조건 1번은 「VM 을 켜고 한 항목씩」인데 `free-vm` 은 `TERMINATED` 다.
**`scripts/deploy.sh:114` 가 저장소의 `docker-compose.yml` 을 그대로 서버로 scp** 하므로
로컬과 운영이 **같은 파일 · 같은 이미지**를 쓴다. 그래서 로컬에서 한 항목씩 적용해 확인했다.

```text
A단계  다이제스트 고정 + db·cloudflared 로그 회전   -> db·app healthy
B단계  no-new-privileges (셋 다)                    -> db·app healthy
C단계  cap_drop ALL (+ db 최소 cap_add)             -> db·app healthy
D단계  app read_only + /tmp tmpfs                   -> db·app healthy
E단계  pids_limit                                   -> db·app healthy
F단계  네트워크 분리                                -> db·app healthy
```

**남은 차이는 커널이다**(Docker Desktop ↔ Ubuntu). 배포 때 한 번 더 확인해야 한다.

### 기존 볼륨으로 시험하면 거짓 통과한다

이슈가 경고한 지점은 postgres **초기화 중**의 `chown`/`setuid` 인데, 초기화가 끝난 `pgdata` 는
그 경로를 **타지 않는다.** 즉 기존 볼륨으로는 `cap_drop: ALL` 만으로도 잘 뜨고 **신규 서버의 첫
배포에서 깨진다.** 그래서 항목마다 `down -v` 로 볼륨을 버리고 초기화를 실제로 태웠다.

### `db` 의 `cap_add` 는 추측이 아니라 실측이다

먼저 음성 대조로 이슈의 경고를 재현했다 — `cap_add` 를 비우면 이렇게 죽는다.

```console
chmod: /var/lib/postgresql/data: Operation not permitted
error: failed switching to 'postgres': operation not permitted
```

그다음 하나씩 빼 보며 좁혔다.

| 시행 | 결과 |
| --- | --- |
| 5개 (`CHOWN` 포함) | healthy |
| **4개 (`CHOWN` 제외)** | **healthy ← 채택** |
| 4개 (`DAC_OVERRIDE` 제외) | unhealthy — `find: Permission denied` |
| 4개 (`FOWNER` 제외) | healthy **이지만** `chmod: Operation not permitted` |
| 3개 | unhealthy |

**`CHOWN` 은 넣지 않는다** — 처음 넣었던 것은 근거 없는 추측이었다. 이미지의 data 디렉터리가
이미 postgres 소유라 신규 named volume 이 그 소유권을 물려받아 chown 할 일이 없다.
**`FOWNER` 는 뺄 수 있어 보이지만 넣는다** — 빼면 healthy 에는 닿는데 `chmod` 가 **조용히
실패한다.** healthcheck 는 통과하고 권한만 어긋나는 조합이라 나중에 원인을 찾기 어렵다.

> `#132`(백업·복구)와 맞물린다 : 위 결론은 **named volume** 전제다. 복구를 bind mount 나 다른
> uid 로 하면 소유권이 어긋나 `CHOWN` 이 다시 필요해질 수 있다. 복구를 실제로 해 볼 때 같이 볼 것.

### `read_only` 는 healthcheck 로 확인하면 안 된다

`/api/health` 는 업로드 경로를 타지 않아 **`read_only` 가 첨부 저장을 깨뜨려도 healthy 로 보인다.**
그래서 쓰기 경로를 직접 찔렀다.

| 경로 | 기대 | 결과 |
| --- | --- | --- |
| `/data/uploads` (첨부 볼륨) | 써져야 한다 | 쓰기·읽기·삭제 성공 |
| `/tmp` (JVM hsperfdata) | 써져야 한다 | 성공 · `/tmp/hsperfdata_app` 생성 확인 |
| `/app`, `/usr/local` | 막혀야 한다 | `Read-only file system` |
| `/app/app.jar` 덮어쓰기 | 막혀야 한다 | `Read-only file system` |
| `/tmp` 크기 상한 | 64m | `tmpfs 64M 32K 64M 1% /tmp` |

### 네트워크 분리는 「막혔다」를 증거로 남겼다

`cloudflared` 가 보는 위치(`edge`)에서 `db` 는 **이름 해석조차 되지 않는다.**

```console
$ docker run --rm --network <edge> alpine getent hosts db
(출력 없음)   종료코드 2

$ docker run --rm --network <edge> alpine nc -z -w3 db 5432
nc: bad address 'db'   종료코드 1
```

동시에 `app:8080` 은 닿고(터널이 살아야 한다) `app → db` 도 그대로 통한다.
`backend` 를 `internal: true` 로 만들지는 **않았다** — db 의 아웃바운드까지 끊는 것은 요구한
분리를 넘어서고 새 실패 모드를 들인다.

### 이미지 표류는 가설이 아니었다

고정하던 날 로컬의 `latest`(**2026-09-09** 빌드)와 레지스트리의 `latest`(**2026-09-11** 빌드)가
**이미 서로 달랐다**(`ff69a222…` ↔ `b269e8ab…`). 최신을 받아 기동을 확인한 뒤 그것으로 고정했다.

### `.env` 권한 — 시험 환경이 먼저 거짓말을 했다

처음 Git Bash(Windows/NTFS)에서 확인했더니 **「고쳤다」고 출력하면서 권한은 644 로 남았다.**
`chmod` 가 먹지 않는 환경이었고, 그대로 믿었으면 「모름」을 「통과」로 읽은 셈이 된다.
배포 대상과 같은 리눅스 컨테이너에서 네 경우를 다시 확인했다 — 644→600 · 이미 600 은 건드리지
않음 · 파일 없음은 경고만 · 640→600.

## 변경 파일

- `docker-compose.yml` — 하드닝 · 로그 회전 · 네트워크 분리 · 다이제스트 고정
- `scripts/deploy.sh` — 프리플라이트에 서버 `.env` 권한 600 고정 추가
- `docs/02_architecture/backend.md` — 「상시 공개」에 위 내용과 근거, `docker inspect` 공유 금지
- `docs/06_changelog/CHANGELOG.md` — Added · Changed

## 검증

- `bash scripts/check-all.sh docs` — **전부 통과, 건너뜀 0건**
- **`shellcheck` 를 실제로 돌렸다.** 로컬에 바이너리가 없어 평소 「모름」으로 남는 항목인데,
  `koalaman/shellcheck:stable`(0.11.0)을 PATH 에 얹어 저장소의 `check-shell-lint.sh` 를 그대로
  불렀다 — 10개 검사 통과, **억제(`disable=`) 추가 없음.**
  (작성 중 SC2016 이 한 번 걸렸는데, 억제하지 않고 `deploy.sh` 가 이미 쓰는 `\$` 이스케이프
  방식으로 맞춰 없앴다.)
- `docker compose config -q` 문법 정상
- 항목별 기동 확인 6단계 전부 `db`·`app` healthy, `app /api/health` 200, 재시작 0회

## 범위에서 뺀 것 — 숨기지 않고 적는다

| 항목 | 왜 못 했나 |
| --- | --- |
| **5. `memswap_limit`/스왑** | 이슈 자체가 「실측 없이 판단하기 어려우니 부하를 걸어 보고 정할 것」이라 적었고 근거가 `pd-standard` 30GB 의 **쓰기 45 IOPS** 다. 개발 PC 디스크로는 그 수치를 재현할 수 없어, 여기서 정하면 **근거 없는 숫자**가 된다. 배포 후 부하 측정으로 미룬다 |
| **3. `TUNNEL_TOKEN` → Docker secret** | 토큰 방식에서 credentials 파일 방식으로 바꾸는 일이라 Cloudflare 대시보드 자료가 필요하다. `docker inspect` 평문 노출은 **아직 열린 문제**이며, 우선 문서에 「출력을 그대로 공유하지 말 것」을 명시했다 |
| `cloudflared` 정상 동작 확인 | `.env` 의 `TUNNEL_TOKEN` 이 아직 자리표시자라 `Provided Tunnel token is not valid` 로 crash-loop 한다. 확인한 것은 **(1) 설정이 런타임에 걸렸는가 (2) 실패 원인이 capability 가 아니라 여전히 토큰인가** 둘뿐이다 |
| `postgres:16-alpine` 다이제스트 고정 | 이슈 범위가 `cloudflared` 였다. 이것도 움직이는 태그라 별도 판단 대상이다 |

## 증거

스크린샷이 없다. 저장소 설정·배포 구성이라 앱 화면이 바뀌지 않는다. 대신 `docker inspect` 와
`/proc/1/status` **런타임 실측**을 before/after 같은 형식으로 남겼다 — compose 파일을 읽어
「걸었다」고 말하지 않았다.

| 파일 | 내용 |
| --- | --- |
| `before/01-runtime-before.txt` | 적용 전 세 컨테이너 실측 (기본 14개 capability) |
| `after/00-stagewise-startup.log` | A~F 6단계 기동 확인 로그 (신규 볼륨) |
| `after/01-negative-control-db-caps.txt` | `db` 최소 capability 집합 실측 + 음성 대조 |
| `after/02-readonly-write-paths.txt` | `read_only` 가 쓰기 경로를 깨뜨리지 않았는지 |
| `after/03-network-separation.txt` | `edge` 에서 `db` 가 안 보이는 것 |
| `after/04-deploy-env-perms.txt` | `.env` 권한 프리플라이트 네 경우 (리눅스에서) |
| `after/05-gates.txt` | 게이트 실행 결과 (shellcheck 실제 실행 포함) |
| `after/06-runtime-after.txt` | 적용 후 실측 + before/after 대조표 |

임시로 만든 프로브 프로젝트(`rag130probe` · `rag130neg`)와 볼륨은 전부 지웠다.
**보존 중인 로컬 데이터(`rag-chatbot_pgdata` · `rag-chatbot_uploads`)는 건드리지 않았다.**

## 남은 이슈

위 표의 네 항목. 첫 둘은 이 이슈에 남아 있고, 나머지 둘은 배포 때 확인하거나 별도로 판단한다.
