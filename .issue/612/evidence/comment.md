## 작업 요약

스토어 동기화(`AdminDocumentService.sync`)가 **지운 지 10분 안인 파일**을 건너뛴다(`DELETE_IN_FLIGHT_GRACE`, 새 조회 `findOpenaiFileIdsDeletedSince`). 삭제는 DB 를 먼저 지우고 스토어 정리를 뒤에 하므로, 그 사이의 동기화가 막 지운 파일을 「정리 실패」로 보고 되살리던 길을 막는다. 10분이 지나면 지금처럼 정리 실패 파일을 다시 넣는다(복구 경로 유지).

## 변경 전후 (`AdminDocumentSyncFlowTest`, PostgreSQL 통합)

| 케이스 | 수정 전 | 수정 후 |
| --- | --- | --- |
| TC-ADMIN-094 막 지운 문서(정리 진행 중) → 살아 있는 행 0 | **실패**(expected 0) | 통과 |
| TC-ADMIN-049 정리 실패 파일(11분 전 삭제) → 다시 들어옴 | 통과 | 통과(삭제 시각을 유예 밖으로 옮김) |

- 원본 출력 : `.issue/612/evidence/before/test.txt` · `after/test.txt`

## 변경 파일

- `AdminDocumentService.java` — 유예 상수 · sync 의 건너뛰기 · Javadoc
- `RagDocumentRepository.java` · `RagDocumentRepository.xml` — `findOpenaiFileIdsDeletedSince`
- `AdminDocumentSyncFlowTest.java` — TC-ADMIN-094 추가 · 049 삭제 시각 조정
- `docs/01_specs/features.md` 동기화 절 · CHANGELOG · `case-floors.env` 440 → 441

## 검증

- `./mvnw -B verify` : tests 441 · failures 0 · errors 0 · 케이스 하한 441/441 · 문서 검사 5종 통과

## 남은 이슈

- 없음. 유예 10분은 상수(설정값 아님) — 바꿀 일이 생기면 env 로 뺀다
