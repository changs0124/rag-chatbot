## 작업 요약

DB 와 첨부를 **매일 04:00(KST) GCS 로 백업**하고, 그 백업으로 **복구를 실제로 한 번** 해 봤습니다. 런칭(10-06)으로 실데이터가 생겨 9-12 의 보류 사유(「잃을 데이터가 없다」)가 풀렸습니다.

## 정한 것 (이슈 본문의 5개 항목)

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 무엇을 | `pg_dump -Fc` + `uploads` tar.gz + `SHA256SUMS` | 첨부는 DB 밖이라 덤프만으로는 반쪽 |
| 어디에 | GCS 버킷 `us-west1` · STANDARD · 공개 차단 · 균일 접근 | 무료 5GB · 같은 리전 전송 무료. 같은 VM 사본은 디스크 사고에 무용 |
| 얼마나 | 매일 1회 · **14일**(버킷 수명주기가 삭제) | 1회분 약 16KB — 한도와 거리가 멂 (사용자 결정) |
| 무엇이 돌리나 | 서버 cron (`backup.sh --install-cron`) | CI 는 유료 한도, 개발 PC 는 꺼지면 안 돌고 새 유출 지점 |
| 복구 | **실제로 수행** — 아래 표 | 복구해 본 적 없는 백업은 백업이 아님 |

버킷 이름은 저장소에 두지 않았습니다(#133) — 서버의 `backup/backup.env` 에만 있습니다. 아래 증거에서도 가렸습니다.

## 쓰기만 되는 전용 키 — 왜, 그리고 정말 쓰기만 되는가

VM 기본 서비스 계정은 저장소 권한이 **읽기 전용**이고, 바꾸려면 VM 을 멈춰야 합니다. 9-30 에 이 존에서 재기동이 12회 연속 실패한 전례가 있어 운영이 다시 못 뜰 위험을 피했습니다. 대신 **버킷 하나에 `objectCreator` 만** 가진 서비스 계정의 키를 서버에 600(디렉터리 700)으로 두었습니다.

| 키로 시도한 것 | 결과 |
| --- | ---: |
| 목록 (objects.list) | **403** |
| 읽기 (objects.get) | **403** |
| 삭제 (objects.delete) | **403** |
| 같은 이름 덮어쓰기 | **403** |
| 버킷 설정 읽기 | **403** |
| 새 객체 올리기 | 성공 (2xx, 백업 실행) |

키가 새도 백업을 읽거나 지울 수 없습니다. 키 파일 원본은 개발 PC 에서 만들어 서버로 옮긴 뒤 로컬 사본을 덮어쓰고 지웠습니다.

**도중에 하나 막혔습니다** — `gcloud storage cp` 는 올리기 전에 대상 객체를 읽어 보는데(`objects.get`), 쓰기 전용 키에는 그 권한이 없어 `--no-clobber` · `--if-generation-match=0` 어느 쪽으로도 **아무것도 올라가지 않았습니다**(1차 실행 실패, 버킷 0개 확인). JSON API 로 직접 올리도록 바꿨습니다(`curl` · `ifGenerationMatch=0`).

## 복구 리허설 (서버, 운영 DB 는 읽기만)

버킷에서 받아 → 체크섬 확인 → **네트워크 없는 임시 postgres** 에 `pg_restore` → 표별 행 수를 운영과 대조.

| 표 | 운영 | 복구 |
| --- | ---: | ---: |
| users | 1 | 1 |
| conversations | 0 | 0 |
| messages | 0 | 0 |
| citations | 0 | 0 |
| attachments | 0 | 0 |
| rag_documents | 0 | 0 |
| flyway_schema_history | 8 | 8 |

체크섬 2건 OK · `pg_restore` 종료코드 0 · 첨부 묶음 풀기 OK.

**한계를 숨기지 않습니다** — 그날 운영 데이터가 거의 비어 있어(사용자 1명) 스키마 · 계정이 돌아오는 것까지만 확인했습니다. 큰 데이터의 복구 시간과, 운영 DB 에 직접 덮는 단계(`--clean`)는 아직 해 보지 않았습니다. 절차는 `backend.md` 에 적었습니다.

## cron

```text
0 4 * * * bash /home/User/deploy/backup.sh >> /home/User/deploy/backup/backup.log 2>&1
```

`--install-cron` 을 두 번 불러도 한 줄인 것을 확인했습니다. **cron 이 실제로 처음 도는 것은 10-07 04:00** 입니다 — 그 실행은 아직 확인하지 못했습니다(cron 의 PATH 에 `/snap/bin` 이 없는 문제는 스크립트가 미리 보정합니다).

## 변경 파일

- `scripts/backup.sh` (신규) — 서버에서 실행. 프리플라이트(빠진 것을 한 번에) · 키 600 아니면 멈춤 · `flock` 중복 실행 방지 · 덤프 목차/묶음 재검증 · 격리된 gcloud 설정 · `--install-cron`
- `scripts/deploy.sh` — `backup.sh` 를 서버로 같이 보냄(cron 이 서버 사본을 부름)
- `docs/02_architecture/backend.md` — 「DB 백업은 자동이 아니다」 한 줄 → 결정 표 · 키 근거 · 보관/권한/수명주기 · 처음 설정 · 복구 절차
- `docs/06_changelog/CHANGELOG.md` — Added

## 검증

- shellcheck(`koalaman/shellcheck:stable`, 로컬 미설치라 컨테이너로 실행) — `backup.sh` · `deploy.sh` 경고 0
- `bash scripts/check-all.sh docs` 통과
- 서버 실행 · 키 거부 시험 · 복구 리허설 — 위 표

## 증거

| 파일 | 내용 |
| --- | --- |
| `before/00-state.txt` | 버킷 0개 · crontab 없음 · VM scope 읽기 전용 · backend.md 「자동이 아니다」 |
| `after/01-bucket.txt` | 버킷 설정 · 수명주기 · IAM · 객체 목록 |
| `after/02-backup-run.txt` | 1차 실패(gcloud cp 403) · 2차 성공 로그 |
| `after/03-deny-cron-restore.txt` | 키 거부 5종 · cron 멱등 · 복구 리허설 원본 |

## 남은 이슈

- 10-07 04:00 첫 cron 실행 확인 (`backup/backup.log` · 버킷에 새 폴더)
- 큰 데이터 복구 시간 · 운영 DB 에 덮는 단계 — 데이터가 쌓인 뒤 다시 리허설
- 서비스 계정 키 회전 주기는 정하지 않았음 (쓰기 전용이라 유출 피해가 작음)
