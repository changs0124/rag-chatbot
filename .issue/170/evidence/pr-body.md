관련 이슈: [#170 docs(ci): PR 푸시에 CI run 이 안 생기면 required checks 가 영구 pending 으로 남는다 — 복구 절차를 기록한다](https://github.com/changs0124/rag-chatbot/issues/170) (통합 테스트 뒤 close)

#166 이 required checks 를 **강제**로 만들면서 이 상황의 성격이 바뀌었다. 종전에는 잡이 안 돌면
사람이 알아채서 손수 돌리고 머지했지만, 이제는 **merge 가 영구 차단된다.**

그런데 **#161 때 쓴 `gh workflow run` 우회가 더 이상 듣지 않는다.** 2026-09-12 PR #168 에서
실제로 겪었다 — 커밋에는 7잡이 `success` 로 붙는데 **PR 의 required checks 는
`workflow_dispatch` 로 생긴 체크를 세지 않아** `BLOCKED` 이 풀리지 않았다.

## 변경 내용

- `docs/CONVENTIONS.md` 「테스트·CI 게이트」 — #166 항목 **바로 뒤**(`:173`)에 붙였다.
  증상이 같고 고치는 법이 다른 둘을 떨어뜨려 두면 읽는 사람이 구분하지 못한다
  - 「체크 이름이 어긋나 pending」(#166) vs 「run 자체가 안 생김」(#170) 구분 기준
  - run 유무 확인 명령 (`gh api ".../actions/runs?branch=…"`)
  - 복구 절차 (`gh pr close` → `gh pr reopen`) 와 커밋 이력을 건드리지 않는다는 이유
  - **`gh workflow run` 은 듣지 않는다**는 점과 실측 근거
- `docs/06_changelog/CHANGELOG.md` — `Added`

실행 코드는 한 줄도 바뀌지 않는다.

## 전후

| 문서 안의 문자열 | 전 | 후 |
| --- | ---: | ---: |
| `"pr reopen"` | 0건 | **1건** |
| `"workflow run"` | 0건 | **1건** |
| `"actions/runs"` | 0건 | **1건** |
| `"run 자체가 안 생긴"` | 0건 | **1건** |

배치 : `CONVENTIONS.md:163` 이 #166 항목, **`:173` 이 이번 항목**, `:207` 이 그다음 #166 항목.

## 검증 — 적어 둔 명령을 문서에서 그대로 추출해 돌렸다

문서에 명령을 적고 돌려보지 않으면 그 자체가 다음 사고가 된다.

| 대상 | 결과 |
| --- | --- |
| run 이 있는 브랜치 | `pull_request` 줄이 head SHA 로 보인다 — 출력 형식이 문서와 일치 |
| 문제 사례 (`chore/166-…`) | `c3e5acc` 에 `workflow_dispatch`(손수 돌린 것)와 `pull_request`(재개방으로 생긴 것)가 둘 다 남아 있다. **재개방 전에는 `pull_request` 줄이 없었다** |
| 이 브랜치 (run 0건) | 종료코드 0 에 출력 0줄 — 「run 없음」이 어떻게 보이는지 그대로 |

**이 검증이 실제로 결함을 잡았다.** 처음 작성할 때 줄바꿈 이스케이프가 공백으로 뭉쳐
**한 줄 140자**가 되어 있었고, 문서에서 추출해 돌려보는 과정에서 드러나 두 줄로 고쳤다.
눈으로 형식만 봤으면 그대로 머지됐을 것이다.

게이트는 `bash scripts/check-all.sh docs` **전부 통과 · 건너뜀 0건**이다. `shellcheck` 는 로컬에
바이너리가 없어 평소 「모름」으로 남는 항목인데 `koalaman/shellcheck:stable`(0.11.0)을 PATH 에
얹어 **실제로 돌렸다.**

### `workflow_dispatch` 가 안 통한다는 주장의 근거

PR #168 은 이미 merge 돼 지금은 재측정할 수 없으므로 관측 당시 값을 남긴다.

```text
커밋 기준 check-runs : total 8  (CI 7잡 전부 success + Vercel)
PR 롤업             : named 1  (Vercel Preview Comments 뿐)
mergeStateStatus    : BLOCKED  (2분 30초간 5회 관측 — 집계 지연이 아님)
gh pr merge 시도     : 거부
재개방 직후          : 롤업 named 8 -> 7잡 통과 -> CLEAN
```

## 원인은 확정하지 못했다

GitHub 쪽 이벤트 유실로 보이나 근거가 없다. 같은 시간대 다른 PR(#169)은 정상이었으므로 저장소
설정 문제가 아니고 **간헐적**이다. `concurrency` 의 `cancel-in-progress` 를 의심했으나 직전 run 이
`cancelled` 가 아니라 `success` 로 끝나 설명되지 않는다. **「모른다」로 적었다.**

**`ci.yml` 과 `concurrency` 는 건드리지 않았다** — 워크플로 정의에 문제가 있는 것이 아니고(같은
파일로 다른 PR 은 정상 동작했다), 추측으로 고치면 #129 가 근거를 들여 정한 값이 조용히 무너진다.
자동 복구 스크립트도 만들지 않았다 — 간헐적이고 빈도를 모른다. 먼저 기록하고, 다시 겪으면 판단한다.

## 증거

[전후 리포트 보기](https://github.com/changs0124/rag-chatbot/issues/170#issuecomment-5644861907)

스크린샷은 없다 — 문서만 바뀌는 변경이라 앱 화면이 없다. 대신 **문서에서 추출한 명령의 실제 실행
출력**을 남겼다. 원본은 `.issue/170/evidence/` (before 1건 / after 1건).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018bBUzct65eWEaZqTgLsri7
