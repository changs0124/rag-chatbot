## 작업 요약
`ChatStreamExceptionHandlerTest` 의 TC-OPS-025~027 을 묶음째 032~034 로 옮겨, 프론트 `refresh.test.ts` 의 TC-OPS-025 와 겹치던 번호를 풀었습니다(#351 과 같은 방식). 먼저 있던 프론트 쪽은 그대로 두었습니다. javadoc · 문서의 ID 만 바뀌고 동작 · 테스트 수는 그대로입니다.

## 변경 전후

| 테스트 | 이전 | 이후 |
|---|---|---|
| SSE 타임아웃은 WARN 한 줄, 스트림에 JSON 없음 | TC-OPS-025 | TC-OPS-032 |
| 스트림 도중 오류는 `error` 이벤트로 종료 | TC-OPS-026 | TC-OPS-033 |
| 커밋 전 타임아웃 503 JSON · 커밋 뒤 무출력 | TC-OPS-027 | TC-OPS-034 |

- 정의가 2건이던 ID : 변경 전 1개(TC-OPS-025) → 변경 후 0개

## 변경 파일
- `backend/src/test/java/com/ragchatbot/controller/ChatStreamExceptionHandlerTest.java` — javadoc ID 3곳
- `docs/02_architecture/backend.md` — 「TC-OPS-025~027 이 잠근다」 → 032~034
- `docs/06_changelog/CHANGELOG.md` — `[Unreleased]` Changed 에 대응표 항목 추가(과거 항목은 이력이라 그대로)

## 검증
- `git grep -n 'TC-OPS-0[0-9][0-9]'`(CHANGELOG · .issue 제외) : ID 마다 정의 한 곳(`evidence/after/tc-ids.txt`)
- `cd backend && ./mvnw verify` : 297 통과, 실패 0 (수 변화 없음)
- `bash scripts/check-all.sh docs` : 돌린 검사 전부 통과(shellcheck 미설치로 1건 건너뜀, 변경과 무관)

## 남은 이슈
없음. 옛 번호(025~027)는 #326 CHANGELOG 항목과 증거 자료에 이력으로 남습니다.
