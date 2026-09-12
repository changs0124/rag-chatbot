관련 이슈: [#161 fix(ci): base 가 main 이 아닌 PR 은 CI 가 안 도는데 「통과」로 보인다](https://github.com/changs0124/rag-chatbot/issues/161) (통합 테스트 뒤 close)

`ci.yml` 의 `pull_request: branches: [main]` 을 뺐다. `pull_request` 의 `branches:` 는 head 가
아니라 **base** 를 필터해서, 다른 PR 브랜치 위에 쌓은 PR 은 **7잡이 하나도 트리거되지 않았다.**
게다가 필터에 걸린 워크플로는 실패도 pending 도 아닌 **「없음」** 이라 체크 목록에 흔적조차
남지 않아, Vercel 하나만 green 인 상태가 그대로 **「통과」로 읽혔다.**

2026-09-11 PR [#160](https://github.com/changs0124/rag-chatbot/pull/160) 이 실제로 그랬고
머지 직전에 겨우 잡아 `gh workflow run` 으로 손수 돌렸다 —
**못 잡았으면 게이트를 한 번도 안 거친 코드가 `main` 에 들어갔다.**

## 변경 내용

- `.github/workflows/ci.yml` — `pull_request:` 의 `branches: [main]` 제거 + 사유 주석
- `docs/06_changelog/CHANGELOG.md` — `[Unreleased] > Fixed` 항목 추가

`push:` 블록은 한 글자도 건드리지 않았다 — `paths-ignore: ['.issue/**']` 는 이슈가 명시한 범위 밖이다.

## 검증 — 실제 스택 PR 로 재현했다

**워크플로 파일만 보고 판단하지 않았다.** 이번 결함이 바로 그렇게 새어 나왔기 때문이다.
base 가 `main` 이 아닌 PR 두 개를 만들어 **워크플로 파일 하나만 다르게** 두고 실측했다.

| | 대조군 [#162](https://github.com/changs0124/rag-chatbot/pull/162) (고치기 전) | 실험군 [#163](https://github.com/changs0124/rag-chatbot/pull/163) (고친 뒤) |
| --- | ---: | ---: |
| base | `probe/161-control-base` | `fix/161-ci-triggers-on-any-pr-base` |
| **실게이트(Actions)** | **0** | **7** (전부 SUCCESS) |
| Vercel | 2 pass | 2 pass |
| `gh pr checks` 종료 코드 | **0 — 통과로 읽힘** | 0 |

```console
$ gh pr checks 162 --json name,state --jq '[.[]|select(.name|test("Vercel")|not)]|length'
0
$ gh pr checks 163 --json name,state --jq '[.[]|select(.name|test("Vercel")|not)]|length'
7
```

확인 뒤 두 PR 을 닫고 `probe/161-*` 브랜치 3개를 전부 지웠다.
`pull_request` 이벤트는 **PR 머지 커밋의 워크플로 파일**로 트리거를 판정하므로,
이 브랜치 위에 쌓은 PR 은 수정된 `on:` 을 읽는다 — 그래서 머지 전에 검증할 수 있었다.

그 밖에 :

- `bash scripts/check-all.sh docs` 통과 (셸 구문 11 · 문서 참조 244 · 섹션 27).
  로컬에 shellcheck 가 없어 셸 정적 분석 1건은 **「통과」가 아니라 「모름」** 이다 —
  그 검사는 실험군 PR 의 `static` 잡에서 실제로 돌아 SUCCESS 였다
- YAML 파싱으로 `pull_request: None`(= 모든 base, 기본 타입 3종) 확인. 잡 수는 종전대로 7개다

## 채택하지 않은 두 안

- **`types:` 에 `edited` 추가** — base 재지정 시점에는 돌지만
  **스택으로 있는 동안에는 여전히 0잡**이라 구멍이 그대로 남는다
- **스택 PR 금지를 문서에 명문화** — 이번 사고가 바로 사람이 기억해야만 막히는 종류였다

**러너 비용은 반대 근거가 되지 않는다.** 2026-09-11 공개 전환으로 standard runner 분이 무료다 —
보안 잡을 주 1회에서 변경마다로 되돌린 #135 와 같은 근거이고, 그 근거는 `ci.yml` 주석과
`CONVENTIONS.md` 에 이미 적혀 있다.

## 이 PR 의 범위 밖 — 별개로 판단이 필요하다

`main` 에 **브랜치 보호가 걸려 있지 않다**(`gh api …/branches/main/protection` → 404).
required status checks 가 없다는 뜻이라, 이 수정으로 잡이 돌더라도 **빨간불인 채로도 머지가 된다.**
이 PR 이 없앤 것은 「안 돈 걸 통과로 읽는」 상태이고, 「실패해도 안 막는」 상태는 그대로다.

## 증거

[전후 리포트 보기](https://github.com/changs0124/rag-chatbot/issues/161#issuecomment-5644241445)
— 원본은 `.issue/161/evidence/`. 화면도 API 도 바뀌지 않는 CI 설정 변경이라 **이미지는 없고**
명령 출력이 그 자리를 대신한다.
