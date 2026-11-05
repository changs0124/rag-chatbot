## 작업 요약

OpenAI 스트림을 파싱하는 경계 네 곳에서 NUL(U+0000)을 지운다. 대상은 답 조각 delta, 검색 결과 text(스니펫 원천), annotation 파일명, 검색 결과 파일명(`resultFilename`)이다. 화면 토큰과 저장본이 같은 값이 되고, PostgreSQL 이 저장을 거절하던 길이 없어진다. 사용자 입력 쪽(#434 의 거절)은 그대로 두었다.

## 변경 전후 (재현 테스트 `OpenAiRealNulTest`, 캔드 스트림)

| 케이스 | 수정 전 (`main` 코드) | 수정 후 |
| --- | --- | --- |
| delta 에 NUL → 토큰 · fullText 에 NUL 없음 | **실패** | 통과 |
| 검색 결과 text 에 NUL → snippet 에 NUL 없음 | **실패** | 통과 |
| 파일명(결과 · annotation)에 NUL → sourceName · 단계 라벨에 NUL 없음 | **실패** | 통과 |

- 원본 출력 : `.issue/610/evidence/before-test.txt`(3/3 실패) · `after-test.txt`(3/3 통과) · `full-verify.txt`
- before-test.txt 의 한글이 깨진 것은 콘솔 인코딩 탓이다. 판정은 `Tests run: 3, Failures: 3` 줄로 한다

## 변경 파일

- `backend/.../openai/OpenAiRealService.java` — `withoutNul` 한 개와 적용 네 곳
- `backend/.../openai/OpenAiRealNulTest.java` — 새 케이스 3개
- `docs/01_specs/api.md` — SSE `token` · `citations` 행에 한 줄씩
- `scripts/case-floors.env` — BACKEND_MIN 437 → 440
- `docs/06_changelog/CHANGELOG.md` — `[Unreleased]` Fixed

## 검증

- `./mvnw -B verify` : Tests run **440**, Failures 0, Errors 0 — BUILD SUCCESS(Testcontainers PostgreSQL 포함)
- `check-case-floor.sh backend` : 실측 440 / 하한 440
- 문서 참조 · 섹션 · 버전 · 충돌 표시 · 응답 계약 검사 통과

## 남은 이슈

- 범위 밖 : 스토어 동기화(`listStoreFiles`)로 들어오는 파일명도 업스트림 값이라 NUL 이 있으면 `rag_documents` 저장이 실패할 수 있다. 채팅 저장 경로가 아니라 이번에는 손대지 않았다. 필요하면 따로 이슈로 연다
- 운영 반영은 다음 백엔드 배포 때다
