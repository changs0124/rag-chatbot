## 작업 요약

`FileService.cleanupUnreferencedFiles`(저장소 스캔 회수)가 파일 하나의 삭제 예외로 루프째 멈추던 것을 고쳤습니다. #365 의 `cleanupOrphans` 와 같은 방식으로 경고 로그를 남기고 다음 파일로 넘어갑니다.
못 지운 파일은 회수 수에 넣지 않습니다. 행이 없는 채로 남으므로 다음 주기에 다시 대상이 됩니다.

## 변경 전후

백엔드 동작 변경이라 화면 캡처 대신 테스트 결과를 남깁니다.

| 항목 | 전 | 후 |
| --- | --- | --- |
| `unreferenced_cleanup_continues_when_a_file_delete_fails` | **ERROR** — `IllegalStateException` 이 루프 밖으로 새어 다음 파일을 지우지 않음 | 통과 — 다음 파일 삭제, 회수 수 1 |
| AttachmentLinkRaceTest · OrphanCleanupSchedulerTest · FileFlowTest | 5건 중 1 ERROR | 5 · 3 · 16건 전부 통과 |
| 경고 로그 | — (예외가 그대로 샘) | `WARN FileService -- 미참조 파일 삭제 실패 - 다음 주기에 다시 시도함. path=u/broken.png` (`after/log-warn.txt`) |
| 백엔드 케이스 수 | 307 | **308** (하한 307 → 308) |

원본 : `.issue/367/evidence/before/test.txt` · `after/test.txt` · `after/log-warn.txt` · `after/check-all.txt`(요약만 — 테스트 로그는 뺐다), 변경 전 코드는 `before/code.txt`.

## 변경 파일

- `backend/src/main/java/com/ragchatbot/service/FileService.java` — 삭제를 try/catch 로 감싸 경고 후 계속
- `backend/src/test/java/com/ragchatbot/service/AttachmentLinkRaceTest.java` — 회귀 테스트 1건
- `docs/02_architecture/backend.md` · `docs/06_changelog/CHANGELOG.md` · `docs/04_tasks/current-sprint.md` · `scripts/case-floors.env`

## 검증

- 테스트를 먼저 넣고 변경 전 코드에서 실패하는 것을 확인한 뒤 고쳤습니다
- `bash scripts/check-all.sh` 통과(백엔드 308 / 프론트 184). shellcheck · gitleaks · trivy 는 로컬에 없어 건너뛰었고 CI 에서 돕니다

## 남은 이슈

- 없음. merge 뒤 `scripts/deploy.sh` 로 배포합니다
