## 작업 요약

`deploy.sh` 가 load 직전 `latest` 를 그대로 `:previous` 로 태그해, load 뒤에서 실패한 배포를 다시 돌리면 한 번도 정상 실행되지 않은 이미지가 `:previous` 를 덮었다. 이제 태그 원본을 다음 순서로 고른다.

1. app 이 **실행 중이고 healthy** 면 그 컨테이너의 이미지 ID(`docker inspect … {{.Image}}`)
2. 아니면 남아 있는 `:previous` 를 **그대로 둔다** - 6단계가 헬스 통과 뒤에만 지우므로, 남아 있다면 지난 배포가 실패했고 그 태그가 아직 마지막 정상 이미지다
3. 둘 다 없으면(첫 배포 등) 종전대로 `latest` 를 쓰고 그 사실을 한 줄 찍는다

**이슈 요구사항과 다른 점** : 이슈가 적은 「실행 중 app 의 이미지, 없으면 `latest`」만으로는 완료 기준의 헬스 실패 재실행을 못 막는다.
- 새 app 이 죽었으면 실행 중 컨테이너가 없어 `latest`(실패 이미지)로 대체된다
- 새 app 이 unhealthy 로 살아 있으면 실행 중 이미지가 곧 실패 이미지다

그래서 「healthy」 조건과 2단계(남은 `:previous` 유지)를 더했다. healthy 는 compose 의 app healthcheck 상태이고, 운영에서 `Up (healthy)` 로 찍히는 것을 확인했다(#127 · #243 증거).

## 변경 전후

가짜 `ssh` · `scp` · `sudo` · `docker` · `curl` · `sleep` · `free` 로 모의했다(서버 접속 없음, #331 I3 방식). 초기 상태는 app = `sha256:old` healthy 실행 중, latest = `sha256:old`, `:previous` 없음.

| 시나리오 | 변경 전 `:previous` | 변경 후 `:previous` |
| --- | --- | --- |
| A1 헬스 실패(새 app 죽음) → 재실행 | `new1` **덮어씀** | **`old`** |
| A2 헬스 실패(새 app unhealthy 로 실행 중) → 재실행 | `new1` **덮어씀** | **`old`** |
| A3 compose 오류(app 은 옛 이미지로 실행 중) → 재실행 | `new1` **덮어씀** | **`old`** |
| A4 헬스 실패 → 안내대로 복구 → 재실패 | `old` | `old` |
| B1 정상 배포(태그 시점) | `old` | `old` |
| B2 latest 가 실행 이미지와 다름(손으로 load 해 둠) → 실패 | `stray` **덮어씀** | **`old`** |
| C app 컨테이너 없음 → 실패 | `old`, 안내 줄 없음 | `old`, **「latest 를 :previous 로 남긴다」 한 줄** |

- 헬스 실패 안내 문구 : 「이전 이미지를」 → 「마지막 정상 이미지를」. 되돌리기 명령(`docker tag :previous :latest && compose up -d`)은 그대로이고 A4 에서 복구가 동작했다

## 변경 파일

- `scripts/deploy.sh` - 4단계 태그 로직(원격 명령 규칙 유지 : 각 줄 `;` 끝 · `#` 없음 · `sudo docker`), 4단계 머리 주석, 헬스 실패 안내 문구, `env_perms` 주석의 덮어씀 서술
- `docs/02_architecture/backend.md` 「배포」 - 「감수하는 약점」 단락에 태그 원본 순서, `.env` 단락의 덮어씀 서술 정리
- `docs/06_changelog/CHANGELOG.md` - `[Unreleased]` `### Fixed`

## 검증

- 모의 7개 시나리오 : 변경 전 4개 덮어씀 → 변경 후 전부 `old`
- `bash -n scripts/deploy.sh` exit 0
- shellcheck 0.11.0 `-x scripts/deploy.sh` exit 0 · `check-shell-lint.sh` 11개 통과
- `bash scripts/check-all.sh quick` 전부 통과
- 원본 : `.issue/350/evidence/before/simulation.txt` · `after/simulation.txt` · `after/verify.txt`, 하네스 `evidence/sim.sh.txt`(`bash sim.sh.txt <저장소 루트>` 로 재현, 셸 게이트 대상에서 빼려고 `.txt`)

## 남은 이슈

- **실제 운영 배포 확인이 남았다.** 배포 전 서버에 `sudo docker tag rag-chatbot-backend:latest rag-chatbot-backend:prev-<sha>` 로 수동 태그를 먼저 남긴 뒤 돌리고, 「`:previous` <- 실행 중(healthy)인 app 의 이미지」 줄이 찍히는지 본다
- 헬스 통과 뒤 6단계 `rmi` 가 실패해 `:previous` 가 남고, 다음 배포 때 app 이 아직 healthy 가 아니면(기동 직후 재배포 등) 그 낡은 `:previous` 가 유지된다. 드문 경우라 감수한다
- 「healthy 조건 · 남은 `:previous` 유지」는 이슈 본문에 없던 판단이다. 리뷰에서 확인받을 것
