관련 이슈: [#166 chore(ci): main 에 required status checks 가 없어 CI 가 빨간불이어도 merge 가 막히지 않는다](https://github.com/changs0124/rag-chatbot/issues/166) (통합 테스트 뒤 close)

`main` 에 `main: CI must pass` ruleset 을 걸어 **CI 7잡 전부를 required status checks 로 만들었다.**
이제 빨간불인 PR 은 merge 가 막힌다. **이 PR 자체가 그 규칙의 첫 시행 대상이다.**

저장소 **설정** 변경이라 diff 에는 문서 두 개만 남는다. 그래서 증거의 무게가 평소보다 크다.

## 변경 내용

- `docs/CONVENTIONS.md` — 「테스트·CI 게이트」에 기록
  - 필수 체크 7개와 `docker` · `secrets` · `deps` 를 빼지 않은 근거
  - Vercel 을 넣지 않은 근거 (#161 의 오독 + 외부 앱 체크는 배포가 건너뛰어지면 아예 보고되지 않음)
  - **`ci.yml` 의 잡 `name:` 과 ruleset 의 context 는 같이 고쳐야 한다**는 경고 — 어긋나면 영영 pending
  - 관리자 우회를 남긴 근거와 strict 를 끈 근거
  - 정본 확인 명령이 `rules/branches/main` 이라는 점 (`enforcement_level` 로는 ruleset 이 안 보인다)
  - 게이트를 걸었으면 API 응답이 아니라 실제 merge 거부로 검증한다는 규칙
- `docs/06_changelog/CHANGELOG.md` — #161 과 서로 다른 결함이라는 점과 네 결정의 근거

## 정한 것

| 정할 것 | 결정 |
| --- | --- |
| 필수로 걸 체크 | CI 7잡 전부 (`backend` · `frontend` · `docker` · `static` · `secrets` · `deps` ×2), Vercel 제외 |
| 관리자 강제 | 우회 허용 (`bypass_actors` = Repository admin / always) |
| 레거시 vs ruleset | ruleset |
| (추가) strict | 끔 |

**관리자 우회는 취향이 아니라 구체적 파손을 피한 것이다.** required status checks 는 PR merge 뿐 아니라
**그 브랜치로의 직접 푸시도 막는다.** 그런데 증거 미러 커밋은 `.issue/**` 만 바꾸고 `paths-ignore` 가
그 푸시의 CI 를 의도적으로 건너뛰므로 **체크가 영영 붙지 않는다.** 관리자까지 강제하면
`issue-start` · `issue-end` 의 증거 미러 푸시가 영구 차단되고, 탈출구는 보호를 통째로 끄는 것뿐이라
그 순간 모든 게이트가 같이 사라진다.

## 검증

**API 응답만 보고 판단하지 않았다.** #161 이 정확히 그렇게 새어 나간 전례가 있다.
관리자 우회가 켜진 `main` 에서 merge 를 시도하면 우회가 적용돼 그냥 성공하므로 아무것도 증명되지
않는다 — 그래서 검증을 둘로 쪼갰다.

- **규칙이 정말 막는가** — 문서 참조를 일부러 깨뜨린 PR(`static` 잡 실패)을 만들고, 관리자 우회를
  **뺀** 동일 규칙을 버릴 브랜치에 걸어 실제로 merge 를 시도했다 →
  `the base branch policy prohibits the merge` 로 **거부됨**. `mergeStateStatus` 가
  `UNSTABLE`(실패해도 merge 허용) → **`BLOCKED`** 으로 바뀌었다. 확인 뒤 PR·브랜치·임시 규칙 전부 삭제.
- **우회가 실제로 살아 있는가** — 이 이슈의 증거 미러 푸시 자체가 검증이 되었다.
  체크가 **0개**인 커밋이 `main` 에 직접 들어갔다(`pushed: true`, `fallback: false`).
- **체크 이름이 글자까지 맞는가** — 필수 7개를 PR 에서 실제로 보고된 이름과 기계적으로 대조했다. 일치.
- **문서 게이트** — `bash scripts/check-all.sh docs` 0 실패.
  shellcheck 는 로컬에 없어 건너뛰었으므로 **「통과」가 아니라 「모름」** 이다(셸 파일은 건드리지
  않았고 이 PR 의 `static` 잡에서 실제로 돈다).

스크린샷은 없다. 성격이 저장소 설정이라 앱 화면이 바뀌지 않고, 대상이었던 GitHub merge 박스는
브라우저 확장이 연결되지 않아 캡처하지 못했다. 조용히 생략하지 않고 적는다 — 대신 설정을 읽은 것이
아니라 merge 를 실제로 시도해 거부당한 기록으로 갈음했다.

## 증거

[전후 리포트 보기](https://github.com/changs0124/rag-chatbot/issues/166#issuecomment-5644475075)

원본은 `.issue/166/evidence/` 에 있다 (before 2건 / after 4건).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_018bBUzct65eWEaZqTgLsri7
