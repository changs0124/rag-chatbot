## 작업 리포트 — #369 통합 테스트 Testcontainers 이미지를 운영 db 다이제스트와 맞추기

브랜치 `chore/369-testcontainers-pg-digest` · 커밋 `2b38ad7`

### 판단
- **고정한다.** 다만 다이제스트를 테스트에 한 번 더 적지 않는다 — 두 곳에 두면 올리는 커밋이 한쪽만 고쳐 조용히 갈리고, 그걸 막으려면 대조 스크립트가 하나 더 필요하다
- 대신 `AbstractPgIntegrationTest` 가 **루트 `docker-compose.yml` 의 db `image:` 줄을 그대로 읽는다.** 정본이 하나라 어긋날 수가 없다. `check-runtime-versions.sh` 등 대조 스크립트 추가는 하지 않았다
  - 테스트는 로컬 · CI 모두 `backend/` 에서 돈다(`ci.yml` 의 `working-directory: backend`, `check-all.sh`). 이미지 빌드는 `-DskipTests` 라(`backend/Dockerfile`) 빌드 문맥에 compose 가 없어도 상관없다
  - 다이제스트 고정 줄을 못 찾으면 태그로 떨어지지 않고 기동을 멈춘다(메시지에 compose 경로)
- 호환성 : 태그 + 다이제스트(`postgres:16-alpine@sha256:…`)를 그대로 넘기면 Testcontainers 가 **거절한다**(실측 — `Failed to verify that image … is a compatible substitute for 'postgres'`). 공식 postgres 이미지이므로 `asCompatibleSubstituteFor("postgres")` 로 명시했다

### 변경
- `backend/src/test/java/com/ragchatbot/support/AbstractPgIntegrationTest.java` — `composeDbImage()` 로 compose 의 image 를 읽어 `PostgreSQLContainer` 에 넘김
- `docker-compose.yml` db 주석 — 「다이제스트를 바꾸는 커밋」 절차에 테스트가 이 줄을 읽는다는 것 · 한 줄 형태 유지 규칙 추가
- `docs/02_architecture/backend.md` 「테스트」 · `CHANGELOG.md` [Unreleased] Changed

### 증거 (문서 · 테스트만 바뀌어 화면 캡처 대신 명령 출력)

| 항목 | 전 | 후 |
| --- | --- | --- |
| 테스트 컨테이너 요청 이미지 | `postgres:16-alpine` (움직이는 태그) | `postgres:16-alpine@sha256:721873c3…` (compose 와 같은 문자열) |
| 실제 이미지 id | `721873c3…` — 이 PC 캐시가 10-16 에 갱신된 우연 | `721873c3…` — 캐시와 무관하게 고정 |
| PG_VERSION | 16.15 | 16.15 |
| compose 다이제스트 제거 시 | (해당 없음) | 기동 중단 `IllegalStateException … 다이제스트 고정된 postgres image 줄을 못 찾음` |

- `.issue/369/evidence/before/container-image.txt` · `after/container-image.txt` · `after/negative-check.txt` — `AdminRoleSyncFlowTest` 실행 중 `docker inspect`
- `after/check-all.txt` — `bash scripts/check-all.sh` exit 0 · **백엔드 308 / 하한 308** · 프론트 184 / 184. 건너뜀 3건(shellcheck · gitleaks · trivy 미설치, CI 에서 돈다)

### 검증
- `./mvnw -B clean verify` 308 통과 · `check-all.sh` 통과
- 운영 코드 변경 없음 — 배포 불필요

### 남은 이슈
- 없음
