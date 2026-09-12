## 작업 요약

제안 **1번(`branches:` 필터 제거)** 을 채택했습니다. `.github/workflows/ci.yml` 의
`pull_request: branches: [main]` 을 빼서 **base 가 무엇이든 7잡이 전부 돌게** 했습니다.
왜 필터가 없는지를 주석으로 남기고 `CHANGELOG.md` 에 기록했습니다.

## 변경 전후 — 실제 스택 PR 로 재현 검증했습니다

**워크플로 파일만 보고 판단하지 않았습니다.** base 가 `main` 이 아닌 PR 을 두 개 만들어
**워크플로 파일 하나만 다르게** 두고 실측했습니다. 확인 뒤 둘 다 닫고 브랜치도 지웠습니다.

| | 대조군 [#162](https://github.com/changs0124/rag-chatbot/pull/162) (고치기 전) | 실험군 [#163](https://github.com/changs0124/rag-chatbot/pull/163) (고친 뒤) |
| --- | ---: | ---: |
| base | `probe/161-control-base` | `fix/161-ci-triggers-on-any-pr-base` |
| **실게이트(Actions)** | **0** | **7** |
| Vercel | 2 pass | 2 pass |
| `gh pr checks` 종료 코드 | **0 (통과로 읽힘)** | 0 |

```console
$ gh pr checks 162 --json name,state --jq '[.[]|select(.name|test("Vercel")|not)]|length'
0          ← 이슈가 말한 그 상태. lint·build·test·시크릿·의존성이 한 번도 안 돌았다

$ gh pr checks 163 --json name,state --jq '[.[]|select(.name|test("Vercel")|not)]|length'
7          ← 전부 SUCCESS
```

`pull_request` 이벤트는 **PR 머지 커밋의 워크플로 파일**로 트리거를 판정하므로,
이 브랜치 위에 쌓은 PR 은 수정된 `on:` 을 읽습니다. 그래서 머지 전에 검증할 수 있었습니다.

**이미지가 없는 이유** — 화면도 API 도 바뀌지 않는 CI 설정 변경이라 캡처할 대상이 없습니다.
대신 위 명령 출력을 증거로 남겼습니다 (`.issue/161/evidence/`).

## 채택하지 않은 두 안과 그 이유

- **2번 (`types:` 에 `edited` 추가)** — base 재지정 시점에는 돌지만
  **스택으로 있는 동안에는 여전히 0잡**이라 구멍이 그대로 남습니다.
- **3번 (스택 PR 금지를 문서에 명문화)** — 워크플로는 그대로 두는 안입니다.
  이번 사고(#160)가 바로 **사람이 기억해야만 막히는 종류**였습니다.

**러너 비용은 1번의 반대 근거가 되지 않습니다.** 2026-09-11 공개 전환으로 standard runner
분이 무료입니다 — 보안 잡을 주 1회에서 변경마다로 되돌린 #135 와 같은 근거입니다.

## 변경 파일

- `.github/workflows/ci.yml` — `pull_request:` 의 `branches: [main]` 제거 + 사유 주석
- `docs/06_changelog/CHANGELOG.md` — `[Unreleased] > Fixed` 항목 추가

`push:` 블록은 한 글자도 건드리지 않았습니다 — `paths-ignore: ['.issue/**']` 는 범위 밖입니다.

## 검증

- `bash scripts/check-all.sh docs` 통과 (셸 구문 11 · 문서 참조 244 · 섹션 27)
  로컬에 shellcheck 가 없어 셸 정적 분석 1건은 **「통과」가 아니라 「모름」** 입니다 —
  그 검사는 실험군 PR 의 `static` 잡에서 실제로 돌아 SUCCESS 였습니다.
- YAML 파싱으로 `pull_request: None`(= 모든 base, 기본 타입) 확인. 잡 수는 종전대로 7개입니다.

## 지나가다 발견한 것 (이번 범위 밖, 고치지 않았습니다)

`main` 브랜치에 **브랜치 보호가 걸려 있지 않습니다** (`gh api …/branches/main/protection` → 404).
required status checks 가 없다는 뜻이라, 이 수정으로 잡이 돌더라도 **빨간불인 채로도 머지가 됩니다.**
이번 이슈가 없앤 것은 「안 돈 걸 통과로 읽는」 상태이고, 「실패해도 막지 않는」 상태는 그대로입니다.
별도 이슈로 다룰지는 판단이 필요합니다.

## 남은 이슈

없음
