## 2회차 — 운영 VM 실측으로 완료 조건 1번 마무리 (2026-10-06)

1회차(9-12)는 VM 이 꺼져 있어 **로컬**에서 한 항목씩 확인했고, 커널이 달라(Docker Desktop ↔ Ubuntu) 완료 조건 1번을 「부분 충족」으로 남겼습니다. 10-06 런칭으로 VM 이 떴고, **첫 배포가 빈 볼륨**이라 이슈가 경고한 postgres 초기화 경로(db 가 capability 4개를 쓰는 유일한 자리)가 Ubuntu 커널에서 실제로 탔습니다.

## 운영 VM 실측 (free-vm · Ubuntu 24.04.5 · 커널 7.0.0-1011-gcp · Docker 29.1.3)

| 항목 | 로컬 1회차 | 운영 VM | 일치 |
| --- | --- | --- | :---: |
| `CapBnd` db | `00000000000000ca` | `00000000000000ca` | ✅ |
| `CapBnd` app · cloudflared | `0` · (토큰 없어 crash-loop) | `0` · `0` | ✅ |
| `NoNewPrivs` (셋 다) | 1 | 1 | ✅ |
| db 빈 볼륨 초기화 | healthy | 오류 없이 `init process complete` | ✅ |
| app `read_only` | uploads·/tmp 쓰기 OK, `/app` 거부 | 같음 · `/tmp` tmpfs 64M | ✅ |
| `edge` → `db` | 이름 해석 실패 | `getent` exit 2 · `nc: bad address 'db'` | ✅ |
| `edge` → `app:8080` | 닿음 | 닿음 (exit 0) | ✅ |
| 로그 회전 · pids | 10m×3 · 128/256/64 | 같음 | ✅ |
| cloudflared 이미지 | `@sha256:b269e8ab…` | 같음 | ✅ |
| cloudflared 동작 | **미확인**(자리표시자 토큰) | **터널 4연결** · `api.chseong.fyi/api/health` 200 | ✅ |
| 서버 `.env` · `backend/.env` 권한 | (deploy.sh 프리플라이트) | `600` · `600` | ✅ |
| 재시작 횟수 | 0 | 0 | ✅ |

측정은 읽기 위주였습니다. 쓰기 확인은 임시 파일을 만들고 바로 지웠고, 네트워크 확인용으로 받은 `alpine` 이미지는 측정 후 VM 에서 지웠습니다. 원본 : `.issue/130/evidence/after/07-vm-runtime-20261006.txt`

## 완료 조건 대조

| 완료 조건 | 상태 |
| --- | --- |
| 각 항목을 **VM 을 켜고** 한 번에 하나씩 적용해 기동 확인 | **충족** — 항목별 적용은 1회차(로컬 A~F), 운영 커널 실측은 이번 |
| `db` 하드닝을 별도로 검증 | 충족 (이번에 운영 빈 볼륨 초기화로 재확인) |
| `db` · `cloudflared` 로그 회전 | 충족 |
| `cloudflared` 다이제스트 고정 | 충족 |
| `backend.md` 갱신 | 충족 — 미확인 문구 정정 |
| `CHANGELOG.md` 반영 | 충족 |

## 나눈 것 (사용자 결정)

- 본문 항목 5 `memswap_limit`·스왑 → [#202](https://github.com/changs0124/rag-chatbot/issues/202) — 운영에 부하를 걸어야 해 시간·방법을 따로 정합니다
- 본문 항목 3-1 `TUNNEL_TOKEN` 파일화 → [#203](https://github.com/changs0124/rag-chatbot/issues/203) — 운영 터널 재기동이 따릅니다

## 변경 파일

- `docs/02_architecture/backend.md` — 「운영 VM 에서도 같은 값을 실측했다」 단락 추가, cloudflared 미확인 문구 정정, 열린 두 항목을 #203 · #202 로 연결
- `docs/06_changelog/CHANGELOG.md` — Changed

## 증거

스크린샷이 없습니다 — 배포 구성 검증이라 화면이 바뀌지 않습니다. 대신 1회차와 같은 형식의 런타임 실측을 남겼습니다.

| 파일 | 내용 |
| --- | --- |
| `before/07-docs-before-vm.txt` | 변경 전 `backend.md` 의 미확인 문구 |
| `after/07-vm-runtime-20261006.txt` | 운영 VM 실측 원본 |

## 검증

- `bash scripts/check-all.sh docs` 통과 (shellcheck 만 로컬 미설치로 「모름」)

`current-sprint.md` 의 #130 행은 이 PR 에서 고치지 않았습니다. 런칭 이전 상태로 남은 다른 문구들과 함께 런칭 문서 반영 작업에서 고칩니다.
