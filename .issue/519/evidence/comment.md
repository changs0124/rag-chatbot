## 작업 요약

`Accept` 가 JSON 을 받지 않는 요청이 최종 폴백으로 떨어져 500 + ERROR 로그(스택)를 남기던 것을, 415 처리기 옆에 전용 처리기를 두어 **406 `NOT_ACCEPTABLE`** 로 돌려준다. 로그는 남기지 않는다(415 와 같은 요청 헤더 문제). 본문은 다른 오류처럼 Accept 와 상관없이 JSON 이다(#279).

## 변경 전후

| 항목 | 전 | 후 |
| --- | --- | --- |
| `GET /api/conversations` + `Accept: application/xml` | **500** `INTERNAL_ERROR` | **406** `NOT_ACCEPTABLE` |
| 서버 로그 | ERROR 「처리되지 않은 예외」 + 스택 | 없음 |
| 응답 Content-Type | application/json | application/json |
| TC-OPS-036 | 실패 (`expected: 406 … but was: 500`) | 통과 |

- 전(운영 c2f8617 재현, 오류 번호 9212b041) : `.issue/519/evidence/before-prod.txt`
- 전(새 테스트를 수정 전 코드에 돌림) : `.issue/519/evidence/before-test.txt`
- 후 : `.issue/519/evidence/after-test.txt` — `GlobalExceptionFallbackTest` 16 · `ChatFlowTest` 21(SSE `Accept: text/event-stream` 경로) 전부 통과

## 변경 파일

- `backend/.../exception/GlobalExceptionHandler.java` — `HttpMediaTypeNotAcceptableException` → 406 처리기
- `backend/.../exception/GlobalExceptionFallbackTest.java` — TC-OPS-036
- `docs/01_specs/api.md` — 오류 코드 표 · HTTP 상태 표에 406, P-3 문단에 406 포함
- `docs/02_architecture/backend.md` — 예외 매핑 표
- `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env` — 백엔드 하한 416 → 417

## 검증

- `bash scripts/check-all.sh` 통과 — 백엔드 417/417 · 프론트 308/308 · 이미지 빌드 · 문서 버전 대조. shellcheck · gitleaks · trivy 는 로컬에 없어 건너뜀(CI 가 돈다)
- 운영 확인은 배포 뒤(백엔드 배포 필요)

## 남은 이슈

- 없음. 같은 감사의 HEAD 401 은 #520, 클레임 누락은 #521
