## 작업 요약

`deploy.sh` 가 load 직전 `latest` 를 그대로 `:previous` 로 태그해, load 뒤에서 실패한 배포를 다시 돌리면 한 번도 정상 실행되지 않은 이미지가 `:previous` 를 덮었다. 이제 태그 원본을 다음 순서로 고른다.

1. app 이 **실행 중이고 healthy** 면 그 컨테이너의 이미지 ID - compose 의 app healthcheck 에 기댄다. healthcheck 가 없으면 상태를 `none` 으로 찍고 2 · 3 으로 간다
2. 아니면 남아 있는 `:previous` 를 **그대로 둔다** - 6단계가 헬스 통과 뒤에만 지우므로 보통 지난 배포가 실패했다는 뜻이다. 그 태그의 이미지 ID 와 실행 중 app 의 이미지 ID 를 한 줄에 함께 찍는다
3. 둘 다 없으면 종전대로 `latest` 를 쓰고 그 사실을 한 줄 찍는다. `latest` 도 없으면(첫 배포) 되돌릴 이미지를 만들지 않았다고 찍는다

헬스 실패 안내는 `:previous` 가 있을 때만 되돌리기 명령을 찍고(「load 전에 `:previous` 로 태그한 이미지」), 없으면 「되돌릴 이미지가 없다」고 찍는다.

**이슈 요구사항과 다른 점** : 이슈가 적은 「실행 중 app 의 이미지, 없으면 `latest`」만으로는 완료 기준의 헬스 실패 재실행을 못 막는다.
- 새 app 이 죽었으면 실행 중 컨테이너가 없어 `latest`(실패 이미지)로 대체된다
- 새 app 이 unhealthy 로 살아 있으면 실행 중 이미지가 곧 실패 이미지다

그래서 「healthy」 조건과 2단계(남은 `:previous` 유지)를 더했다. 운영 app 은 `Up (healthy)` 로 찍힌다(#127 · #243 증거).

## 변경 전후

가짜 `ssh` · `scp` · `sudo` · `docker` · `curl` · `sleep` · `free` 로 모의했다(서버 접속 없음, #331 I3 방식). 초기 상태는 app = `sha256:old` healthy 실행 중, latest = `sha256:old`, `:previous` 없음.

| 시나리오 | 변경 전 `:previous` | 변경 후 `:previous` |
| --- | --- | --- |
| A1 헬스 실패(새 app 죽음) → 재실행 | `new1` **덮어씀** | **`old`** |
| A2 헬스 실패(새 app unhealthy 로 실행 중) → 재실행 | `new1` **덮어씀** | **`old`** |
| A3 compose 오류(`up` · `ps` 모두 실패, app 은 옛 이미지로 실행 중) → 재실행 | `new1` **덮어씀** | **`old`** |
| A4 헬스 실패 → 안내대로 복구 → 재실패 | `old` | `old` |
| B1 정상 배포(태그 시점) | `old` | `old` |
| B2 latest 가 실행 이미지와 다름(손으로 load 해 둠) → 실패 | `stray` **덮어씀** | **`old`** |
| C app 컨테이너 없음 → 실패 | `old`, 안내 줄 없음 | `old`, **「latest 를 :previous 로 남긴다」 한 줄** |
| C2 진짜 첫 배포(컨테이너 · latest 모두 없음) → 실패 | 없음, **없는 `:previous` 로 되돌리라는 명령 출력** | 없음, **「되돌릴 이미지를 만들지 않았다」 · 「되돌릴 이미지가 없다」** |
| D app 에 healthcheck 없음 → 실패 → 재실행 | `new1` **덮어씀** | **`old`**(상태 `none` 으로 출력) |

## 변경 파일

- `scripts/deploy.sh` - 4단계 태그 로직(원격 명령 규칙 유지 : 각 줄 `;` 끝 · `#` 없음 · `sudo docker`), 4단계 머리 주석, 헬스 실패 안내(조건부 되돌리기 명령), `env_perms` 주석의 덮어씀 서술
- `docs/02_architecture/backend.md` 「배포」 - 「감수하는 약점」 단락에 태그 원본 순서, `.env` 단락의 덮어씀 서술 정리
- `docs/06_changelog/CHANGELOG.md` - `[Unreleased]` `### Fixed`

## 검증

- 모의 9개 시나리오 : 변경 전 5개 덮어씀 · C2 는 없는 태그로 되돌리라는 명령 출력 → 변경 후 전부 기대대로
- `bash -n scripts/deploy.sh` exit 0
- shellcheck 0.11.0 `-x scripts/deploy.sh` exit 0 · 하네스 exit 0 · `check-shell-lint.sh` 11개 통과
- `bash scripts/check-all.sh quick` 전부 통과
- 리뷰(APPROVE) 지적 MEDIUM-1~4 · LOW-1 · 하네스 보강을 반영했다
- 원본 : `.issue/350/evidence/before/simulation.txt` · `after/simulation.txt` · `after/verify.txt`, 하네스 `evidence/sim.sh.txt`(`bash sim.sh.txt <저장소 루트>` 로 재현, 셸 게이트 대상에서 빼려고 `.txt`)

## 남은 이슈

- **실제 운영 배포 확인이 남았다.** 배포 전 서버에 `sudo docker tag rag-chatbot-backend:latest rag-chatbot-backend:prev-<sha>` 로 수동 태그를 먼저 남긴 뒤 돌리고, 「`:previous` <- 실행 중(healthy)인 app 의 이미지」 줄이 찍히는지 본다
- **낡은 `:previous` 가 남을 수 있다(MEDIUM-2).** 헬스 통과 뒤 6단계 `rmi` 가 실패하면 `:previous` 가 남는다. 다음 배포 때 app 이 healthy 가 아니면 2단계가 그 낡은 태그를 유지한다. 막지는 않고, 그 줄에 태그 이미지 ID 와 실행 중 app 이미지 ID 를 함께 찍어 운영자가 어긋남을 보게 했다
- **느린 기동 직후 재배포** : 컨테이너가 아직 healthcheck `starting` 인 동안(기동 직후 재배포 등) 다시 배포하면 1단계를 건너뛴다. 6단계가 `:previous` 를 지웠다면 3단계로 가 `latest` 를 쓰는데, 이때 `latest` 는 방금 통과한 실행 이미지라 결과는 맞다. 다만 위의 낡은 태그가 함께 있으면 그것이 유지된다
- **compose 자체가 깨졌을 때** : `ps` 가 실패하면 상태가 「app 없음」으로 찍힌다(A3). 태그 결과는 맞지만 표시는 정확하지 않다
