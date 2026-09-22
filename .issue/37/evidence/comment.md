## 작업 요약

완료 조건 셋째 줄 「결론을 코드 주석이나 문서에 남긴다」를 마쳤다. 그 전에 **판정의 빈 곳 하나를 메웠다** — 지난 코멘트까지 헤더 **없이** 확인한 것은 목록 조회(`GET`)뿐이었고, 이슈가 문제 삼은 쓰기 경로는 헤더를 **실은** 채로만 통과했다. 그래서 쓰기 경로도 헤더 없이 실제로 불렀다.

## 헤더 없는 실호출 (before 증거)

모든 요청에 `OpenAI-Beta` 헤더 없음. 시험 파일 1건(`beta-probe-37.txt`)으로 하고 끝에 지웠다. 스토어의 기존 문서 2건은 건드리지 않았다(정리 후 `completed 2 · total 2`).

| 호출 | 결과 |
| --- | ---: |
| `GET /vector_stores` | 200 |
| `POST /vector_stores/{id}/files` — 업로드 연결 (이슈의 핵심 경로) | 200 |
| `GET /vector_stores/{id}/files/{fid}` — 상태 조회 | 200 |
| `DELETE /vector_stores/{id}/files/{fid}` — 연결 해제 | 200 |

원본 : `.issue/37/evidence/before/probe.txt`

**결론 — 헤더는 필수가 아니고, 실어도 무해하다.** 헤더를 실은 현재 구현으로 업로드 → `completed` · 삭제가 정상이었으므로(직전 코멘트) 코드는 그대로 두고 공식 SDK 와 맞추는 쪽으로 남긴다.

## 변경 파일

- `OpenAiRealService.java` 상수 javadoc — 「필수인지는 확인하지 못했다」 → 판정 결과
- `OpenAiRealBetaHeaderTest.java` 머리주석 — 「실키가 없어 확인할 수 없음」 → 판정 결과 (후속 커밋)
- `docs/01_specs/live-integration.md` — 판정표 설명 · 200/400 행 · 가정 F 를 확인됨으로 (v1.2)
- `docs/04_tasks/current-sprint.md` — 런칭 대기 표에서 #37 제거, 키 투입 순서 1) 제거, 「셋」→「둘」
- `docs/04_tasks/backlog.md` · `docs/02_architecture/backend.md` — 「이슈 셋(#37 · #130 · #132)」 정리
- `docs/06_changelog/CHANGELOG.md`

지난 코멘트의 「닫을 때 같이 고칠 곳」 목록을 전부 반영했고, 목록에 없던 테스트 머리주석 1곳을 추가로 찾아 고쳤다.

## 검증

- `scripts/check-all.sh` 통과 (문서 참조 · 섹션 · 버전) — shellcheck · gitleaks · trivy 는 로컬에 없어 **돌지 않았다**
- `OpenAiRealBetaHeaderTest` 2건 통과
- 「이슈 셋」 · 「확인하지 못했다」 류 서술 잔존 0건 — `.issue/37/evidence/after/checks.txt`

캡처는 없다 — 문서·주석 변경이라 화면이 바뀌지 않는다.

## 남은 이슈

- 범위 밖으로 남긴 것 : `current-sprint.md` 「OpenAI 실 연동 투입」 항목이 여전히 「키·스토어 확보 전이라 착수 불가」로 적혀 있다. 로컬 실연동은 오늘 끝났으므로 낡았지만, 원인이 달라 이 PR 에 섞지 않았다
