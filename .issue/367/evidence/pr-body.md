관련 이슈: [#367 cleanupUnreferencedFiles 루프가 파일 삭제 실패에서 멈춤](https://github.com/changs0124/rag-chatbot/issues/367) (통합 테스트 뒤 close)

## 변경 내용
- `FileService.cleanupUnreferencedFiles` : 파일 삭제 예외를 잡아 경고 로그 후 다음 파일로 넘어간다(#365 의 `cleanupOrphans` 와 같은 방식). 못 지운 파일은 회수 수에 넣지 않는다 — 행이 없는 채로 남아 다음 주기에 다시 대상이 된다
- `AttachmentLinkRaceTest` : 회귀 테스트 1건(변경 전 코드에서 ERROR 확인)
- 하한 백엔드 307 → 308, `backend.md` · `CHANGELOG` · `current-sprint`

## 검증
- 관련 테스트 AttachmentLinkRaceTest 5 · OrphanCleanupSchedulerTest 3 · FileFlowTest 16 통과
- `bash scripts/check-all.sh` 통과(백엔드 308 / 프론트 184). shellcheck · gitleaks · trivy 는 로컬에 없어 CI 에 맡김
- 증거 리포트 : [이슈 코멘트](https://github.com/changs0124/rag-chatbot/issues/367#issuecomment-6215679553)

## 배포
- 백엔드가 바뀌므로 merge 뒤 `scripts/deploy.sh` 로 배포한다
