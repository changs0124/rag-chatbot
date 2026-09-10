## 구현 완료 — 실기기 실측까지 마쳤습니다

브랜치 `chore/127-issue-127` · 커밋 `c9418b4`(구현) + `19fb9f5`(실측 반영)

작업 성격이 **문서·설정**이라 스크린샷이 성립하지 않습니다. 증거는 실측 명령 출력으로 남겼습니다.

## 1. 서버에서 빌드가 불가능해졌는지

`docker compose config` 로 병합 결과를 대조했습니다.

| | before | after |
|---|---|---|
| `app.build` | **1건** | **0건** |
| `mem_limit` | **0건** | **3건** |

- [before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/127/evidence/before-compose-config.txt) · [after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/127/evidence/after-compose-config.txt)
- override 를 겹치면 `build.context` 가 복원됩니다 — [after (override)](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/127/evidence/after-compose-config-build.txt)

절차가 아니라 **키를 없애서** 막았습니다. 본체에 `build` 를 남기면 이미지를 못 찾은 `up` 이 조용히 빌드로 빠지는 경로가 남습니다.

## 2. 메모리 실측 — GCP e2-micro 실기기

`us-west1-b` / `e2-micro` / 953Mi + 스왑 2GB / `pd-standard` 30GB / Ubuntu 24.04.5 LTS

```
NAME           MEM USAGE / LIMIT   MEM %    CPU %
deploy-app-1   163.9MiB / 420MiB   39.03%   0.18%
deploy-db-1     36.3MiB / 160MiB   22.69%   4.47%

Mem:  953Mi total, 573Mi used, 380Mi available
Swap: 2.0Gi total,  30Mi used

GET /api/health → HTTP 200
```

| 구성요소 | 이슈 추정 | 실측 |
|---|---|---|
| app | ~300MB | **164MiB** |
| db | ~100MB | **36MiB** |
| 시스템 전체 | ~780MB | **573Mi / 953Mi** |

**스왑을 30MiB 밖에 쓰지 않았습니다.** 기동 피크가 물리 메모리 안에서 끝났습니다.

적용 확인 — 컨테이너 안에서 직접 읽었습니다.

```
JAVA_TOOL_OPTIONS = -XX:MaxRAMPercentage=65 -XX:+UseSerialGC -Xss512k
SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE = 5
```

전문 : [after-server-measurement.txt](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/127/evidence/after-server-measurement.txt)

**이 값을 그대로 믿으면 안 되는 조건** — `APP_MODE=mock` · 요청 0건 · `cloudflared` 제외 · 기동 직후입니다. 운영에서는 cloudflared 30~50MB, 트래픽과 첨부(최대 26MB 멀티파트)가 힙을 밀어올립니다. **하한에 가까운 값이라 상한(420m/160m/64m)은 그대로 둡니다.**

## 3. 보존 항목 — 실기기 확인

| 항목 | 확인 |
|---|---|
| 로그 회전 (#103 직결) | `{"Type":"json-file","Config":{"max-file":"3","max-size":"10m"}}` |
| 볼륨 영속 | `deploy_pgdata` · `deploy_uploads` 생성 |
| 루프백 바인딩 | `127.0.0.1:8080->8080/tcp` |
| `db` healthcheck 선행 | `db Healthy` → `app Starting` 순서 |
| `start_period: 90s` | `config` 에 `1m30s` |
| 터널만 외부 노출 | 인바운드 포트 미개방 유지 |

## 4. 문서 게이트

```
check-doc-refs.sh      참조 수집 215건 · 실재 검사 206건 → 통과
check-doc-sections.sh  섹션 참조 22건 대조 → 통과
docker build           exit 0 (CI docker 잡과 동일)
```

[문서 게이트 출력](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/127/evidence/after-doc-gates.txt)

## 완료 조건 대조

- [x] `docker compose pull && docker compose up -d` 만으로 배포 — 서버에서 Maven 이 돌지 않음
- [x] 세 컨테이너 `mem_limit`, 실측 합계가 물리 메모리 아래(573Mi / 953Mi)
- [x] `GET /api/health` 200
- [x] 보존 6항목 동작
- [x] `backend.md` · `INDEX.md` 갱신
- [x] `check-doc-refs.sh` · `check-doc-sections.sh` 통과
- [x] `CHANGELOG.md` 반영
- [ ] **main 푸시 시 GHCR 에 `:latest` + `:<sha>` 가 올라간다** — 워크플로가 main 에 들어가야 처음 돈다. 머지 후 확인 필요
- [ ] **PR 에서 푸시하지 않는다** — 이 PR 의 `docker` 잡으로 확인 가능
- [ ] **패키지 public 이라 `docker login` 없이 pull** — 첫 푸시 후 패키지 가시성 설정 필요

마지막 셋은 **구조상 머지 전에 확인할 수 없습니다.** 그래서 이번 실측은 로컬 빌드 이미지를 `docker save`/`load` 로 서버에 반입한 뒤 GHCR 태그로 재태그해서 진행했습니다 — compose 가 기대하는 이름 그대로 띄워 나머지 조건을 전부 검증했습니다.

실측에 쓴 컨테이너와 볼륨은 `docker compose down -v` 로 정리했습니다. 서버에는 Docker 와 이미지만 남아 있습니다.
