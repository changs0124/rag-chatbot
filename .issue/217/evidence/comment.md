## #217 작업 리포트 — 업로드 형식 오류 500 → 400

**원인** : `FileController.upload` · `AdminController.uploadDocument` 의 `@RequestParam("file") MultipartFile` 이 비면 스프링이 `MissingServletRequestPartException`(파트 없음) · `MultipartException`(멀티파트 아님)을 던지는데, `GlobalExceptionHandler` 에 핸들러가 없어 폴백(`handleUnexpected`)이 500 + ERROR 로그로 받았다.

**변경** : `handleBadUpload` 하나로 두 예외를 400 `BAD_REQUEST` 로. 메시지에 예외 원문은 싣지 않는다. 용량 초과 413 은 하위 예외라 기존 핸들러가 그대로 받는다.

| | 변경 전 | 변경 후 |
|---|---|---|
| TC-OPS-022 멀티파트 · `file` 파트 없음 | 500 `INTERNAL_ERROR` | 400 `BAD_REQUEST` |
| TC-OPS-023 멀티파트 아님 (`application/json`) | 500 `INTERNAL_ERROR` | 400 `BAD_REQUEST` |
| 폴백 ERROR 로그 | 2건(위 두 예외) | 0건 |
| 백엔드 전체 | 239 | 241 통과 · 실패 0 |
| 413 회귀 (`AdminDocumentFlowTest`) | — | 21/21 통과 |

- 변경 전 원본 : [재현.txt](EVIDENCE_BEFORE)
- 변경 후 원본 : [결과.txt](EVIDENCE_AFTER)
- 문서 : `api.md` 에러 표 · `backend.md` 예외 처리 · CHANGELOG · `case-floors.env` 239 → 241
- 게이트 : merge-markers · doc-refs · doc-sections · doc-versions · response-contract · case-floor(backend) 통과

화면 변화가 없는 백엔드 변경이라 캡처 대신 테스트 출력 원본을 증거로 남겼다.
