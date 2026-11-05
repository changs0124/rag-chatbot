## 작업 요약

테스트만 바꿨다(동작 변화 없음). `AdminDocumentSyncFlowTest` 의 TC-ADMIN-049 · 094 가 `deleted_at` 을 SQL `now()` 대신 **JVM 시각 파라미터**(`OffsetDateTime.now()`)로 넣는다. 운영 코드의 삭제 시각(`softDelete`)과 동기화 기준 시각이 모두 JVM 시계라, 같은 시계를 써야 컨테이너 VM 시계가 어긋날 때 거짓 실패가 나지 않는다. 049 는 1시간 전으로 넓혔다.

## 확인

- 수정 후 `AdminDocumentSyncFlowTest` 8/8 통과(`after/test.txt`)
- 변이 : `sync` 의 유예 확인(`deleting.contains`)을 빼면 094 가 실패한다(`before/mutation.txt`) — 시계를 바꿔도 테스트가 수정을 계속 지킨다
- TC-ADMIN-052 의 `now()` 는 유예와 무관한 인덱스 케이스라 그대로 뒀다

## 검증

- main 을 합친 뒤 `./mvnw -B verify` 는 통합 단계에서 돌린다(케이스 수 변화 없음 445)
- 비판 리뷰(opus) proceed — pgjdbc 가 `OffsetDateTime` 을 timestamptz 로 바로 묶음

## 남은 이슈

- 없음
