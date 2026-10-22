## 작업 요약
`backend/Dockerfile` 의 두 `FROM` 을 멀티 아키텍처 인덱스 다이제스트로, `ci.yml` 의 `actions/checkout` · `setup-java` · `setup-node` 를 40자 커밋 SHA + 버전 주석(trivy-action 과 같은 형식)으로 고정했습니다. 고정값을 올리는 방법은 `backend.md` 의 db 다이제스트 설명 바로 아래 한 단락에 적었습니다.

## 변경 전후
| 대상 | 전 | 후 |
|---|---|---|
| 빌드 이미지 | `maven:3.9.16-eclipse-temurin-17-alpine` | `...@sha256:b7c8d7298dbabbe750441736cd99a1d120a58083d5af8d2bd75a1624cfdd8f3a` |
| 런타임 이미지 | `eclipse-temurin:17-jre-alpine` | `...@sha256:c4a33e6ddb738fe4be0a28a613ea0940cec42d25d7263c3e2238c43354cb19b0` |
| actions/checkout | `@v4` | `@11d5960a326750d5838078e36cf38b85af677262   # v4.4.0` |
| actions/setup-java | `@v4` | `@cf277c60eb25467037889841efdb72551f06f6c3   # v4.9.1` |
| actions/setup-node | `@v4` | `@49933ea5288caeca8642d1e84afbd3f7d6820020   # v4.4.0` |

원본 grep 은 `.issue/416/evidence/before/pins.txt`, 변경 후는 `after/pins.txt`.

## 검증
- `docker build -t rag-chatbot-backend:pin416 backend` 성공(deploy.sh 와 같은 컨텍스트 · 명령)
- `bash scripts/check-all.sh docs` 통과(shellcheck 없어 셸 정적 분석만 건너뜀)
- 액션 SHA 는 `gh api repos/actions/<이름>/git/ref/tags/<태그>` 로 받아 `commits/<태그>` 와 교차 확인(전부 annotated 아닌 lightweight 태그, 커밋 SHA 일치)
- CI 통과는 PR 에서 확인 예정

## 변경 파일
`backend/Dockerfile` · `.github/workflows/ci.yml` · `docs/02_architecture/backend.md` · `docs/06_changelog/CHANGELOG.md`

## 남은 이슈
- 고정값은 **자동으로 갱신되지 않는다.** 올릴 때는 `docker buildx imagetools inspect <이미지:태그>` 의 최상단 `Digest:` 와 `gh api repos/actions/<이름>/git/ref/tags/<태그>` 의 SHA 로 바꾸는 커밋 하나로 올린다(`backend.md` 참고).
- 보안 패치가 반영되려면 사람이 올려야 한다는 것이 비용이다. 필요하면 Dependabot 도입은 별도 이슈.
