## 작업 요약

`main` 에 `main: CI must pass` ruleset 을 걸어 **CI 7잡 전부를 required status checks 로 만들었다.**
이제 빨간불인 PR 은 merge 가 막힌다. 무엇이 필수인지와 네 결정의 근거를 `docs/CONVENTIONS.md`
「테스트·CI 게이트」에 기록했다.

## 정한 것 셋 (+ 하나)

| 정할 것 | 결정 | 근거 |
| --- | --- | --- |
| 필수로 걸 체크 | **CI 7잡 전부**, Vercel 제외 | `docker` 를 빼도 잡은 어차피 모든 PR 에서 돌아 **시간이 줄지 않는다** — 얻는 것 없이 Dockerfile 게이트만 잃는다. `secrets`·`deps` 를 빼면 「공개 저장소는 시크릿 회수가 불가능하므로 merge 전에 돌아야 한다」는 #135 의 근거가 거짓이 된다. Vercel 은 #161 에서 오독의 원인이었고, 외부 앱 체크는 배포가 건너뛰어지면 **아예 보고되지 않아** 필수로 걸면 merge 를 영영 막는다 |
| 관리자 강제 | **우회 허용** (`bypass_actors` = Repository admin / always) | 아래에 따로 적었다 — 취향이 아니라 구체적 파손을 피한 것이다 |
| 레거시 vs ruleset | **ruleset** | 우회 주체를 불리언이 아니라 명시적 목록으로 적을 수 있고, 레거시 API 는 수정할 때마다 전체 객체를 다시 PUT 해야 해서 다른 설정을 실수로 지우기 쉽다 |
| (추가) strict | **끔** | 본문에 없지만 같은 설정 안에서 정해야 했다. 증거 미러 커밋이 `main` 에 직접 올라가는 워크플로라, 켜면 **증거를 푸시할 때마다 열린 PR 전부가 낡아져** 매번 rebase 와 7잡 재실행을 요구한다 |

### 관리자 우회를 남긴 이유 — 잠그면 이 저장소가 깨진다

required status checks 는 PR merge 뿐 아니라 **그 브랜치로의 직접 푸시도 막는다.**
그런데 이 저장소의 증거 미러 커밋은 `.issue/**` 만 바꾸고, `ci.yml` 의 `paths-ignore` 가 그 푸시의
CI 를 **의도적으로 건너뛴다** — 즉 그 커밋에는 체크가 영영 붙지 않는다.
관리자까지 강제하면 **issue-start · issue-end 의 증거 미러 푸시가 영구 차단되고,**
탈출구는 보호를 통째로 끄는 것뿐이라 그 순간 모든 게이트가 같이 사라진다.

우회를 남겨도 게이트는 산다 — **관리자에게도 merge 상태가 `BLOCKED`** 이고, 우회는 `--admin` 이라는
**별도의 명시적 동작**이라 기록이 남는다. 「사람이 안 보면 그만」인 종전 상태와는 다르다.

## 검증 — API 응답이 아니라 실제 merge 거부로 확인했다

본문의 「API 응답만 보고 판단하지 않는다」를 지켰다. 일부러 문서 참조를 깨뜨린 PR(`static` 잡 실패)을
만들어 확인했고, 확인이 끝난 뒤 PR 과 브랜치를 삭제했다.

**관리자 우회가 켜진 `main` 에서 merge 를 시도하면 우회가 적용돼 그냥 성공하므로 아무것도 증명하지
못한다.** 그래서 검증을 둘로 쪼갰다.

**(1) 규칙이 정말 막는가** — 우회를 **뺀** 동일 규칙을 버릴 브랜치에 걸고 실제로 merge 를 시도했다.
막히지 않았더라도 깨진 커밋은 그 브랜치에 들어가 `main` 은 영향이 없는 구조다.

```console
$ gh pr merge 167 --merge
X Pull request changs0124/rag-chatbot#167 is not mergeable: the base branch policy prohibits the merge.
To use administrator privileges to immediately merge the pull request, add the `--admin` flag.
```

| | 규칙 적용 전 | 규칙 적용 후 |
| --- | --- | --- |
| `mergeStateStatus` | `UNSTABLE` (실패 체크가 있어도 **merge 허용**) | **`BLOCKED`** (보호 규칙이 막음) |
| 실제 merge 시도 | — | **거부됨**, `state: OPEN` / `mergedAt: null` |

`mergeStateStatus` 는 설정값이 아니라 **GitHub 이 계산해 merge 버튼 상태를 그대로 결정하는 필드**다.

**(2) 우회가 실제로 살아 있는가** — 이 이슈의 증거 미러 푸시 자체가 검증이 되었다.
`.issue/**` 만 바꿔 체크가 **0개**인 커밋이 `main` 에 직접 들어갔다(`pushed: true`, `fallback: false`).
우회가 없었다면 불가능한 푸시다.

**(3) 체크 이름이 글자까지 맞는가** — 틀리면 영영 pending 으로 남아 merge 를 완전히 막으므로
필수 7개를 PR 에서 실제로 보고된 이름과 기계적으로 대조했다. 일치.
그래서 **`ci.yml` 의 잡 `name:` 과 ruleset 의 context 는 같이 고쳐야 한다**는 경고를 문서에 남겼다.

## 적용 결과

```console
$ gh api repos/changs0124/rag-chatbot/rules/branches/main
[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,
  "required_status_checks":[
    {"context":"backend (test + build + 케이스 수 하한)"},
    {"context":"frontend (lint + test + build + 케이스 수 하한)"},
    {"context":"docker (백엔드 이미지 빌드)"},
    {"context":"static (셸 구문·분석 · 계약 · 문서 참조 · 섹션 이름)"},
    {"context":"secrets (시크릿 스캔)"},
    {"context":"deps (백엔드 의존성 취약점)"},
    {"context":"deps (프론트 의존성 취약점)"}]},
  "ruleset_id":23021430}]
```

**확인 명령이 본문과 달라졌다.** 본문의 `.protection.required_status_checks.enforcement_level` 로는
**ruleset 이 안 보여 `off` 로 나온다** — 그 명령으로 판단하면 걸려 있는데 없다고 읽는다.
정본은 레거시와 ruleset 을 **둘 다** 모아 주는 위의 `rules/branches/main` 이다. 문서에도 그렇게 적었다.

## 변경 파일

- `docs/CONVENTIONS.md` — 「테스트·CI 게이트」에 필수 체크 7개 · Vercel 제외 근거 · 잡 `name:` 과
  ruleset context 를 함께 고쳐야 하는 이유 · 관리자 우회와 strict 결정 · 정본 확인 명령 ·
  실제 merge 거부로 검증하는 규칙을 기록
- `docs/06_changelog/CHANGELOG.md` — #161 과 서로 다른 결함이라는 점과 네 결정의 근거

저장소 **설정** 변경은 diff 에 남지 않는다. 그래서 증거 원본을 `.issue/166/evidence/` 에 같이 넣었다.

## 증거

스크린샷이 없다. 성격이 저장소 설정이라 앱 화면이 바뀌지 않고, 대상이었던 GitHub merge 박스는
**브라우저 확장이 연결되지 않아** 캡처하지 못했다. 조용히 생략하지 않고 이유를 적는다.
대신 **설정을 읽는 것이 아니라 merge 를 실제로 시도해 거부당한 기록**으로 갈음했다 — 스크린샷보다
집행 경로에 가까운 증거다.

| 파일 | 내용 |
| --- | --- |
| `before/01-rules-api.txt` | 적용 전 — 레거시·ruleset 둘 다 없음 |
| `before/02-pr-167-merge-state.txt` | 적용 전 — 빨간 X 가 있는데 `UNSTABLE` / `MERGEABLE` |
| `after/01-gate-actually-blocks.txt` | 실제 merge 시도가 거부된 기록 (우회 없는 격리 검증) |
| `after/02-main-ruleset-applied.txt` | 적용된 정본 ruleset + 체크 이름 대조 |
| `after/03-admin-bypass-verified.txt` | 우회가 살아 있음 + 임시 자원 전부 정리됨 |

## 남은 이슈

없음. 임시로 만든 것(probe ruleset · `ci-gate-probe-base` · 깨뜨린 PR #167 과 그 브랜치)은
전부 삭제했고, `main` 에는 ruleset 하나만 남아 있다.
