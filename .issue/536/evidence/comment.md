## #536 전후 리포트

**원인** : 크레딧 소진은 HTTP 200 으로 열린 스트림에 `error` → `response.failed`(`insufficient_quota` / `credit_balance_exhausted`)로 온다. `consumeStream` 이 두 이벤트를 읽지 않아 「완료(response.completed) 없이 종료됨」만 던졌다.

**결정** : 원인 코드만 예외 문구에 싣는다. ERROR · 스택 · 사용자 SSE `STREAM_ERROR` · 저장 동작은 그대로 — `insufficient_quota` 는 운영자가 조치해야 해 업로드 경로(#479)처럼 ERROR 로 둔다(이슈 본문의 「WARN 한 줄」 기준은 이 판단으로 바꿨다).

### before — 운영 로그 (10-28, 백엔드 1627392)
```
처리되지 않은 예외 [403a683d] POST /api/chat
java.lang.IllegalStateException: OpenAI 스트림이 완료(response.completed) 없이 종료됨
```
(같은 시각 4건. 직접 호출로 본 스트림에는 `event: error` · `event: response.failed` 에 `credit_balance_exhausted` 가 있었다) — 원자료 `.issue/536/evidence/before-log.txt`

### after — 구현 `37ebc7c`
```
java.lang.IllegalStateException: OpenAI 응답이 실패로 끝남 code=credit_balance_exhausted type=insufficient_quota message=You have no credits remaining.
```
- 캔드 스트림 테스트 3건(`OpenAiRealStreamFailureTest`) : 크레딧 소진 실제 모양 · `response.failed` 만 · 사유 없는 끊김(예전 문구 유지). 줄바꿈은 공백으로(로그 위조 방지, #479 의 `oneLine` 재사용)
- 회귀 : `mvnw verify` 422/422 통과 · 케이스 수 하한 419 → 422 · `check-all.sh docs` 통과
- 문서 : `live-integration.md` 가정 B · CHANGELOG [Unreleased]
- 미확인 항목 확인 : 크레딧 소진 턴은 `savePartial` 이 빈 본문 · `status=error` 로 저장한다(기존 동작, 화면의 오류 버블과 재조회가 같다)
- 운영 반영은 merge 뒤 백엔드 배포 때. 실호출 검증은 크레딧 충전 뒤 — 원자료 `.issue/536/evidence/after-test.txt`
