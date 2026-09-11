## 무엇을 했나

`secrets`(gitleaks) · `deps-backend`(Trivy) · `deps-frontend`(npm audit) 세 잡의 `if:` 조건을 없애 **변경마다 돌게** 했다. `schedule` 트리거는 그대로 뒀다.

**근거가 여섯 곳에 흩어져 있어 함께 고쳤다.** 조건만 바꾸고 "비공개라 유료 한도"를 남기면 다음 사람이 옛 근거를 읽고 되돌린다.

| 파일 | 고친 것 |
|---|---|
| `.github/workflows/ci.yml` | 트리거 주석 + 세 잡의 머리 주석 + `if:` 3개 |
| `scripts/check-all.sh` | 머리 주석 2곳 + 구획 제목 2곳(`· 주 1회` → `· 변경마다`) |
| `docs/CONVENTIONS.md` | 게이트 목록 |
| `docs/INDEX.md` | CI 표 — **표 안의 값이라 게이트가 못 잡는다** |
| `docs/04_tasks/current-sprint.md` | "Actions 가 멎어 있다" — **이 이슈와 무관하게 이미 거짓이던 서술** |
| `docs/06_changelog/CHANGELOG.md` | `[Unreleased]` |

## 왜 지금인가

PR #134 는 이 세 잡이 **`skipped` 인 채로 merge 됐다.** 공개 저장소의 첫 PR 이 정작 시크릿 검사를 받지 않은 셈이다.

비용 근거가 사라진 것만이 아니라 **놓쳤을 때의 대가가 커졌다** — 공개 저장소는 시크릿이 한 번 들어오면 회수가 불가능하다.

## `schedule` 을 남긴 이유

세 잡은 **우리 커밋이 아니라 바깥(취약점 DB · 커밋 이력 전체)이 바뀔 때도** 결과가 달라진다. PR 마다 도는 것과 주간 실행은 서로 다른 것을 잡는다.

없앴다면 코드 4잡의 `if: != 'schedule'` 도 전부 의미를 잃어 함께 지워야 했고, 그중 하나가 `static` 잡이라 **#136(셸 게이트)과 같은 hunk 에서 충돌**했을 것이다.

## 부작용 (주석에 남김)

이제 PR 레인에서도 돌므로 force-push 시 `cancel-in-progress` 가 gitleaks 의 이력 전체 스캔을 중간에 끊는다. 새 푸시가 곧바로 다시 돌려 **실해는 없다.** 다만 `concurrency` 주석이 "스캔이 조용히 취소되고 다음 주까지 재시도가 없다"를 길게 경고해 둔 파일이라, 그건 **schedule 레인** 이야기임을 구분해 적었다.

## 검증

| 항목 | 결과 |
|---|---|
| `grep "비공개"` (여섯 파일) | **0건** |
| YAML 파싱 | 7잡 그대로. 코드 4잡 `if:` 불변, 보안 3잡 조건 없음 |
| `schedule` · `cron` | 유지 |
| `bash scripts/check-all.sh docs` | 통과 |

**실제 CI 동작 확인은 이 PR 자체가 증거가 된다** — PR 이벤트에서 `secrets`·`deps` 가 `skipped` 가 아니라 실행되면 완료 기준 1이 충족된다.

## 손대지 않은 것

`CHANGELOG.md:82`·`:111` 의 "비공개" 는 #127 당시 상황의 **이력 서술**이라 지금도 맞는 값이다(#133 에서 `/home/User/deploy` 를 남긴 것과 같은 판단). `ci.yml` 의 `fetch-depth: 0` 주석("얕은 클론이면 PR 커밋을 못 봄")은 PR 을 전제로 쓰였는데 정작 PR 에서 돈 적이 없었다 — **이 변경이 그 주석을 비로소 참으로 만든다.**
