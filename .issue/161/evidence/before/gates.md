# before — 변경 전 상태 (pure 워크트리, 파일 수정 전)

수집 시각 : 2026-09-12 / 브랜치 `fix/161-ci-triggers-on-any-pr-base` (origin/main 과 동일)

## 1. 트리거 정의 — `.github/workflows/ci.yml`

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - '.issue/**'
  pull_request:
    branches: [main]        # ← PR 의 base 를 거른다. base 가 main 이 아니면 run 자체가 없다
```

`pull_request` 의 `branches:` 는 head 가 아니라 **base** 를 필터한다.
필터를 통과하지 못한 워크플로는 실패도 pending 도 아닌 **「없음」** 이라 체크 목록에
아무 흔적이 남지 않는다. 그래서 Vercel 하나만 남아 green 으로 읽힌다.

## 2. 사람이 손으로 CI 를 살려낸 기록

```console
$ gh run list --workflow=ci.yml --limit 15 --json databaseId,event,headBranch,conclusion,createdAt \
    --jq '.[] | "\(.createdAt)\t\(.event)\t\(.headBranch)\t\(.conclusion)"'

2026-09-11T09:43:47Z    pull_request        fix/156-theme-scheme-follows-data-theme   success
2026-09-11T09:39:44Z    pull_request        fix/155-palette-leftover-colors           success
2026-09-11T09:33:27Z    pull_request        fix/154-logo-a11y-api-align               success
2026-09-11T09:25:23Z    workflow_dispatch   fix/156-theme-scheme-follows-data-theme   success   ← 손으로 쏜 것
2026-09-11T09:11:54Z    pull_request        docs/153-issue-153                        success
```

`fix/156-…` 만 **`workflow_dispatch`** 로 한 번 돈다. 이 브랜치가 PR #160 의 head 이고,
당시 base 가 `main` 이 아니라 PR #157 의 브랜치였다 — 자동으로는 한 잡도 돌지 않아
사람이 `gh workflow run ci.yml --ref …` 로 직접 쏜 것이다. 다른 PR 에는 이 이벤트가 없다.

## 3. 지금은 「보이지 않는다」는 것 자체가 증거다

```console
$ gh pr list --state all --limit 60 --json number,baseRefName \
    --jq '.[] | select(.baseRefName != "main")'
(출력 없음)
```

base 가 main 이 아닌 PR 이 **한 건도 남아 있지 않다.** #160 은 머지 전에 base 를 main 으로
재지정했기 때문이다. 그래서 사후에 `gh pr checks 160` 을 돌리면 7잡이 전부 SUCCESS 로 나온다 —
**수동 실행과 재지정 뒤의 결과이지, 스택 상태에서 돌았다는 뜻이 아니다.**

```console
$ gh pr checks 160 --json name,state --jq '[.[]|select(.name|test("Vercel")|not)]|length'
7
```

결함이 사후 조회로는 재현되지 않는다는 점이 이 이슈의 위험이다 —
**잡히지 않으면 흔적도 남지 않는다.** 그래서 after 는 프로브 PR 로 직접 확인한다.

## 4. 대조군 PR 로 직접 재현했다 — 실게이트 0개, 그런데 「통과」

고치기 전 워크플로만 담은 브랜치 두 개로 스택 PR 을 만들어 확인했다.
[#162 \[대조군 · 머지 금지\] #161 고치기 전 스택 PR](https://github.com/changs0124/rag-chatbot/pull/162)
(`probe/161-control-head` → `probe/161-control-base`, 둘 다 `origin/main` 8a030d1 기준)

```console
$ gh pr checks 162 --json name,state
[{"name":"Vercel Preview Comments","state":"SUCCESS"},{"name":"Vercel","state":"SUCCESS"}]

$ gh pr checks 162 --json name,state --jq '[.[]|select(.name|test("Vercel")|not)]|length'
0
```

사람이 보는 화면도 같다. **exit code 가 0** 이라 스크립트로 걸러도 통과로 읽힌다.

```console
$ gh pr checks 162
Vercel                    pass  0  …  Deployment has completed
Vercel Preview Comments   pass  0  …
$ echo $?
0
```

lint · build · test · 케이스 수 하한 · 문서 참조 · 시크릿 스캔 · 의존성 취약점이
**한 번도 안 돌았는데 경고가 없다.** 이슈 본문의 표와 정확히 일치한다.
