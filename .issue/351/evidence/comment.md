## 작업 요약
`GlobalExceptionFallbackTest` 의 TC-OPS-020~023 을 028~031 로 옮겨, JWT 슬라이딩 재발급 테스트(FEAT-OPS-003, 020~024)와 겹치던 번호를 풀었다. 나중에 붙은 폴백 쪽만 옮겼고(변경 전 최고 번호 027), javadoc · 주석 · 문서의 ID 만 바뀐다. 동작과 테스트 수는 그대로다.

## 변경 전후

| 테스트 | 이전 | 이후 |
|---|---|---|
| 미지원 메서드 405 + `Allow` | TC-OPS-020 | TC-OPS-028 |
| 미지원 미디어 타입 415 | TC-OPS-021 | TC-OPS-029 |
| 멀티파트 `file` 파트 없음 400 | TC-OPS-022 | TC-OPS-030 |
| 멀티파트 아님 400 | TC-OPS-023 | TC-OPS-031 |

- 중복 정의 : 변경 전 020 · 022 · 023 은 두 곳, 021 은 슬라이딩 머리말과 폴백 한 곳씩 겹쳤다. 변경 후 모든 ID 가 한 묶음에서만 정의된다.
- `backend.md` 「TC-OPS-014~023 이 잠근다」 → 「014~019 · 028~031」 (014~019 는 폴백의 본문 파싱 · 라우팅, 020~023 은 슬라이딩 재발급이라 폴백 쪽만 남긴다).

## 변경 파일
- `backend/src/test/java/com/ragchatbot/exception/GlobalExceptionFallbackTest.java`
- `backend/src/main/java/com/ragchatbot/exception/GlobalExceptionHandler.java` (javadoc 만)
- `docs/02_architecture/backend.md`
- `docs/06_changelog/CHANGELOG.md` (`[Unreleased]` 에 대응표 항목 추가, 과거 항목은 그대로)

## 검증
- `cd backend && ./mvnw verify` : 297 통과, 실패 0 (수 변화 없음)
- `bash scripts/check-all.sh docs` : 통과 (shellcheck 없음으로 1건 건너뜀)
- 전후 `git grep` 집계 : `evidence/before|after/tc-ids.txt`

## 남은 이슈
- `frontend/src/lib/refresh.test.ts` 가 TC-OPS-025 를 쓰며 `ChatStreamExceptionHandlerTest` 의 025 와 겹친다. 이 이슈 범위(020~023) 밖이라 손대지 않았다.
