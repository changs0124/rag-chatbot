관련 이슈: [#174 docs(tasks): 배포를 기다리는 이슈들과 키 투입 직후 순서가 current-sprint 에 없다](https://github.com/changs0124/rag-chatbot/issues/174) (통합 테스트 뒤 close)

`current-sprint.md` 의 「런칭」이 **저장소 밖 준비물을 기다린다**고만 적고 **무엇이 그것을
기다리는지**는 적지 않았다. 열려 있는 세 이슈(`#130` · `#132` · `#37`)가 전부 배포·실키를 기다리는데
두 문서 어디에도 이름이 없었다(각 0건). 배포하는 날 이슈를 각각 열어 봐야 알 수 있는 상태였다.

## 변경 내용

- `docs/04_tasks/current-sprint.md` — **런칭의 정본**으로 삼고 셋을 추가
  - **VM 상태** : `e2-micro` 구축 완료 · `free-vm`(`us-west1-b`)이 현재 `TERMINATED`.
    「처음부터 만들어야 하나」와 「켜기만 하면 되나」는 착수 비용이 다르다
  - **기다리는 이슈 셋** — 각각 무엇이 남았고 왜 지금 못 하는지 표로
  - **키 투입 직후 순서** — `#37` 의 `curl`(2초) → 배포 → `#130` VM 확인 → `#132` 착수
  - 마지막 업데이트 2026-09-10 → 2026-09-12
- `docs/04_tasks/backlog.md` — 런칭 항목을 **정본 가리키기**로 축소
- `docs/06_changelog/CHANGELOG.md` — `Added` · `Changed`

실행 코드는 한 줄도 바뀌지 않는다.

## 중복을 없애면서 내용을 잃지 않았다

같은 준비물 목록이 `current-sprint.md`(8-20행)와 `backlog.md`(25-31행) **양쪽에** 있어
한쪽만 고치면 갈라졌다. 정본을 `current-sprint.md` 로 고른 근거는 두 문서가 스스로 적어 둔
구분이다 — `backlog.md` 는 「아직 착수하지 않은 것」, `current-sprint.md` 는 「아직 안 끝난 것」이고
런칭은 **진행 중인 일**이다(`current-sprint.md:5`).

**그런데 `backlog.md` 쪽이 더 자세했다.** 지우기만 하면 내용을 잃으므로 다섯 문자열을 계수해 확인했다.

| 문자열 | `current-sprint.md` | `backlog.md` |
| --- | ---: | ---: |
| `localhost:8080` (프로덕션 번들에 박혀 있음) | **1건** | 0건 |
| `CORS 로 전 API 차단` | **1건** | 0건 |
| `assets/index-` | **1건** | 0건 |
| `통짜로 실행된 적이 없다` | **1건** | 0건 |
| `TUNNEL_TOKEN` | **1건** | 0건 |

다섯 전부 정본으로 옮겨졌고 `backlog.md` 에는 가리키는 한 줄만 남았다.
**중복을 지우면서 내용을 잃으면 고치려던 문제보다 나쁜 결과가 되므로** 이 계수를 증거로 남겼다.

## 검증

- `bash scripts/check-all.sh docs` — **전부 통과 · 건너뜀 0건** (`shellcheck` 을 Docker 로 실제 실행)
- 언급 계수 — `#130`·`#132`·`#37`·`e2-micro`·`free-vm`·`TERMINATED` 가 before 0건 → after 1건
- VM 상태는 `gcloud compute instances list` 로 실측

### 실행하지 않은 것

문서에 적은 `#37` 의 `curl` 은 **실 `OPENAI_API_KEY` 가 필요해 돌리지 못했다.**
#170 · #172 에서는 적어 둔 명령을 파일에서 추출해 실제로 돌려 검증했지만 이번 것은 그럴 수 없다.
**「적어 두고 돌려보지 않은 명령」이 하나 남았다** — 키가 들어오는 날 그 한 줄이 첫 동작이다.

## 충돌 예고

이 브랜치는 `#172`(PR #173) 머지 **전** `main` 에서 떴다. 둘 다 `CHANGELOG.md` 의 `Added` ·
`Changed` 맨 앞에 항목을 넣으므로 **가산 충돌**이 난다. 양쪽 항목을 모두 보존하면 된다.

## 증거

[전후 리포트 보기](https://github.com/changs0124/rag-chatbot/issues/174#issuecomment-5645091157)

캡처는 없다 — 문서만 바뀌는 변경이라 앱 화면이 없다.
원본은 `.issue/174/evidence/` (before 1건 / after 1건).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018bBUzct65eWEaZqTgLsri7
