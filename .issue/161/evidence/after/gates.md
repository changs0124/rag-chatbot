# after — 변경 뒤 상태

브랜치 `fix/161-ci-triggers-on-any-pr-base` (커밋 `bc09988`)

## 1. 트리거 정의 — 필터 제거

```diff
   pull_request:
-    branches: [main]
+  # (왜 필터가 없는지에 대한 주석 12줄)
```

`push:` 블록은 한 글자도 바뀌지 않았다. `paths-ignore: ['.issue/**']` 는 범위 밖이다.

```console
$ python -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); \
             print(list(d[True].keys())); print(repr(d[True]['pull_request'])); print(d[True]['push'])"
['push', 'pull_request', 'schedule', 'workflow_dispatch']
None
{'branches': ['main'], 'paths-ignore': ['.issue/**']}
```

`pull_request: None` 은 **모든 base · 기본 타입(opened · synchronize · reopened)** 을 뜻한다.
잡은 종전대로 7개다 — 늘거나 줄지 않았다.

## 2. 실험군 PR 로 재현 검증 — 실게이트 7개

[#163 \[실험군 · 머지 금지\] #161 고친 뒤 스택 PR](https://github.com/changs0124/rag-chatbot/pull/163)
(`probe/161-stack-check` → `fix/161-ci-triggers-on-any-pr-base`)

**base 가 `main` 이 아니다.** 대조군 #162 와 다른 것은 워크플로 파일 하나뿐이다.

```console
$ gh pr checks 163 --json name,state --jq '[.[]|select(.name|test("Vercel")|not)]|length'
7

$ gh pr checks 163 --json name,state --jq '.[] | "\(.state)\t\(.name)"'
SUCCESS  Vercel Preview Comments
SUCCESS  backend (test + build + 케이스 수 하한)
SUCCESS  frontend (lint + test + build + 케이스 수 하한)
SUCCESS  docker (백엔드 이미지 빌드)
SUCCESS  static (셸 구문·분석 · 계약 · 문서 참조 · 섹션 이름)
SUCCESS  secrets (시크릿 스캔)
SUCCESS  deps (백엔드 의존성 취약점)
SUCCESS  deps (프론트 의존성 취약점)
SUCCESS  Vercel
```

`pull_request` 이벤트는 **PR 의 머지 커밋에 있는 워크플로 파일**로 트리거를 판정하므로,
이 브랜치 위에 쌓은 PR 은 수정된 `on:` 을 읽는다 — 그래서 머지 전에 검증이 가능했다.

## 3. 로컬 게이트

```console
$ bash scripts/check-all.sh docs
  ✓ 셸 구문 검사        (11개)
  - 건너뜀: 셸 정적 분석 — shellcheck 없음 (CI 러너에는 기본 설치)
  ✓ 문서 참조 실재       (수집 256건 · 실재 검사 244건)
  ✓ 문서 섹션 이름 대조   (27건)
돌린 검사는 전부 통과
$ echo $?
0
```

로컬에 shellcheck 가 없어 1건은 **「통과」가 아니라 「모름」** 이다.
그 검사는 위 실험군 PR 의 `static` 잡에서 실제로 돌아 SUCCESS 였다.

## 4. 프로브 정리

검증이 끝난 뒤 PR #162 · #163 을 닫고 `probe/161-*` 브랜치 3개를 지웠다.
남긴 것은 이 기록과 위 두 PR 의 링크뿐이다.
