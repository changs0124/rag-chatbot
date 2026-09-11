## 무엇을 했나

`scripts/check-shell-lint.sh` 를 추가해 추적되는 셸 전부에 **`shellcheck -x`** 를 돌린다. `check-all.sh` 와 CI `static` 잡 양쪽에서 `bash -n` 바로 뒤에 돈다.

**`check-shell-syntax.sh` 와 나눴다** — 합치면 실패 신호가 섞인다. 앞이 죽으면 파일이 **파싱조차 안 되는** 것이고, 여기가 죽으면 **파싱은 되는데 의도와 다르게 도는** 것이다.

## 필요성은 실증으로 확인했다

`#138` 의 버그(`printf '""N""' "$1" "$2"` 가 인자를 버리던 것)를 일부러 되살려 보니 정확히 갈렸다 :

```
bash -n          → 통과 (못 잡는다)
shellcheck       → check-all.sh:36:9: error: This printf format string has no
                   variables. Other arguments are ignored. [SC2182]
check-shell-lint → exit 1        (되돌린 뒤 exit 0)
```

## 기존 12건을 전부 처리하고 넣었다

하한을 두면 그 아래가 조용히 쌓여, 게이트가 빨간불이 되는 날 아무도 안 본다.

| 처리 | 건수 | 내용 |
|---|---|---|
| **고침** | 2 | `check-doc-versions.sh` 의 `${name}` 중괄호(SC1087) · `check-case-floor.sh` 의 `source=` 경로를 루트 기준으로(SC1091 이 `-x` 로 해소) |
| **배열 전환** | 3 | `check-doc-refs`·`check-doc-sections` 의 `$paths` 를 문자열→배열(SC2086) |
| **근거 있는 억제** | 6 | 백틱을 리터럴로 찾는 정규식 3(SC2016) · `summary()` 뒤 안전망 `exit` 2(SC2317) · 우리가 만든 고정 파일명의 `ls` 1(SC2012) |

**억제는 전부 지시 바로 위에 이유를 한국어로 적었다.** 규칙만 끄면 다음 사람이 왜 껐는지 모른다.

**배열 전환은 부수 효과로 개선이다** — 경로에 공백이 있어도 견딘다. 동작이 같음은 수정 전후 스크립트가 **같은 출력**(참조 234/실재 223 · 섹션 24)을 내는 것으로 확인했다.

`check-case-floor.sh:18` 의 `# shellcheck source=` 지시 주석은 **누군가 shellcheck 를 염두에 두고 쓴 흔적**이었다. 경로만 루트 기준으로 맞추니 `-x` 로 해소됐다 — 그 의도를 살렸다.

## 규칙 번호를 정정했다

그 버그는 **SC2183 이 아니라 SC2182** 다("format string has no variables"). `#136`·`#138`·`#142` 에서 잘못 적은 것을 추적 파일 세 곳(`CHANGELOG.md` · `CONVENTIONS.md` · `check-shell-syntax.sh`)에서 바로잡았다. `.issue/` 증거 6파일은 **당시 기록이라 그대로 둔다.**

## 게이트가 만들어지자마자 두 번 일했다

- **내 주석을 잡았다** — `# shellcheck 가 없으면…` 으로 시작하는 줄을 shellcheck 가 **지시문으로 파싱**해 SC1072/SC1073 이 났다. 어순을 바꿔 해결
- **자기 자신을 잡았다** — 커밋되어 추적 대상이 되자 `check-shell-lint.sh:15` 의 같은 형태 주석이 걸렸다. `#136` 에서 대상 수가 9→10 으로 바뀐 것과 같은 구조다

## 검증

| 완료 기준 | 결과 |
|---|---|
| shellcheck 경고 | **0건** (도입 전 12건) |
| 대상 수 | 구문 11개(`*.sh` 10 + env) / 정적 분석 10개(`*.sh` 만) |
| SC2182 위반 주입 시 실패 | ✓ `exit 1`, 되돌리면 `exit 0` |
| 12건 각각 고침/끔/허용 결정 + 근거 | ✓ |
| 경고 남긴 채 통과 안 함 | ✓ 하한 없음 |
| 로컬에 도구 없을 때 | **"모름"** 으로 표시, `exit 0` |
| `check-all.sh docs` · CI `static` | ✓ |
| `CONVENTIONS.md` · `CHANGELOG.md` | ✓ |

## 대상 수가 다른 이유

`case-floors.env` 는 **구문 검사에만** 넣는다. 단독으로는 셸 조각이라 shellcheck 가 셸 종류를 정하지 못한다. 대신 소싱하는 `check-case-floor.sh` 를 `-x` 로 보면서 함께 검사된다.
