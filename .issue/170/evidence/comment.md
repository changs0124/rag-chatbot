## 작업 요약

`docs/CONVENTIONS.md` 의 「테스트·CI 게이트」에 **「run 자체가 안 생긴 경우」의 증상·확인 방법·복구
절차**를 기록했다. #166 항목 **바로 뒤**에 붙였다 — 「체크 이름이 어긋나 pending」과 증상이 같고
고치는 법이 달라서, 떨어뜨려 두면 읽는 사람이 구분하지 못한다.

## 기록한 것

```text
증상 구분
  체크가 이름만 다른 것이 붙어 pending   -> ci.yml 의 name: 과 ruleset context 를 맞춘다 (#166)
  체크가 아예 붙지 않음                   -> run 자체가 안 생긴 것이다 (#170)

run 유무 확인
  gh api "repos/changs0124/rag-chatbot/actions/runs?branch=<브랜치>" \
    --jq '.workflow_runs[]|"\(.created_at) \(.event) \(.head_sha[0:8])"'

복구
  gh pr close <n> && gh pr reopen <n>
```

`reopened` 는 `pull_request` 의 기본 트리거 타입이라 `ci.yml` 이 그대로 받고 **커밋 이력을
건드리지 않는다**(빈 커밋보다 나은 이유다).

**`gh workflow run` 은 듣지 않는다**는 점을 근거와 함께 적었다. #161 의 기록이 그쪽을 「확인 수단」
으로 가리키고 있어 적지 않으면 다음 사람이 먼저 그것을 집는다.

## 변경 전후

| | before | after |
| --- | ---: | ---: |
| `"pr reopen"` | 0건 | **1건** |
| `"workflow run"` | 0건 | **1건** |
| `"actions/runs"` | 0건 | **1건** |
| `"run 자체가 안 생긴"` | 0건 | **1건** |

배치도 의도대로다 — `CONVENTIONS.md:163` 이 #166 항목, **`:173` 이 이번 항목**, `:207` 이 그다음
#166 항목이다.

## 검증 — 적어 둔 명령을 문서에서 그대로 추출해 돌렸다

문서에 명령을 적고 돌려보지 않으면 그 자체가 다음 사고가 된다. 세 경우로 확인했다.

| 대상 | 결과 |
| --- | --- |
| run 이 있는 브랜치 (`chore/130-…`) | `pull_request` 줄이 head SHA 로 보인다 — 출력 형식이 문서와 일치 |
| 문제 사례 (`chore/166-…`) | `c3e5acc` 에 `workflow_dispatch`(손수 돌린 것)와 `pull_request`(재개방으로 생긴 것)가 둘 다 남아 있다. **재개방 전에는 `pull_request` 줄이 없었다** |
| 이 브랜치 (run 0건) | 종료코드 0 에 출력 0줄 — 「run 없음」이 어떻게 보이는지 그대로 |

**이 검증이 실제로 결함을 잡았다.** 처음 작성할 때 줄바꿈 이스케이프가 공백으로 뭉쳐
**한 줄 140자**가 되어 있었다. 문서에서 추출해 돌려보는 과정에서 드러나 두 줄로 고쳤다.
형식만 보고 넘겼으면 그대로 머지됐을 것이다.

게이트는 `bash scripts/check-all.sh docs` **전부 통과 · 건너뜀 0건**이다. `shellcheck` 는 로컬에
바이너리가 없어 평소 「모름」으로 남는 항목인데 Docker 이미지를 PATH 에 얹어 **실제로 돌렸다.**

## `workflow_dispatch` 가 안 통한다는 주장의 근거

PR #168 은 이미 merge 돼 지금은 재측정할 수 없으므로 관측 당시 값을 남긴다.

```text
커밋 기준 check-runs : total 8  (CI 7잡 전부 success + Vercel)
PR 롤업             : named 1  (Vercel Preview Comments 뿐)
mergeStateStatus    : BLOCKED  (2분 30초간 5회 관측 — 집계 지연이 아님)
gh pr merge 시도     : 거부
재개방 직후          : 롤업 named 8 -> 7잡 통과 -> CLEAN
```

## 변경 파일

- `docs/CONVENTIONS.md` — 「테스트·CI 게이트」에 항목 하나 추가 (#166 항목 바로 뒤)
- `docs/06_changelog/CHANGELOG.md` — `Added`

## 원인은 여전히 모른다

GitHub 쪽 이벤트 유실로 보이나 확정할 근거가 없다. 같은 시간대 다른 PR(#169)은 정상이었으므로
저장소 설정 문제가 아니고 간헐적이다. `concurrency` 의 `cancel-in-progress` 를 의심했으나 직전 run 이
`cancelled` 가 아니라 `success` 로 끝나 설명되지 않는다. **그대로 「모른다」로 적었다.**

`ci.yml` 과 `concurrency` 는 건드리지 않았다 — 추측으로 고치면 #129 가 근거를 들여 정한 값이
조용히 무너진다. 자동 복구 스크립트도 만들지 않았다(간헐적이고 빈도를 모른다).

## 증거

스크린샷이 없다. 문서만 바뀌는 변경이라 앱 화면이 없다. 대신 **문서에서 추출한 명령의 실제 실행
출력**을 남겼다 — 형식이 맞는지 확인한 근거다.

| 파일 | 내용 |
| --- | --- |
| `before/01-docs-before.txt` | 추가 전 단락 상태 — 복구 관련 문자열 전부 0건 |
| `after/01-docs-after.txt` | 추가 후 + 명령 3경우 실행 결과 + 배치 확인 + 게이트 |

## 남은 이슈

없음. 원인 미확정은 문서와 이슈 본문에 그대로 남겼다.
