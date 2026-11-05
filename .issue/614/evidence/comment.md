## 작업 요약

테스트만 바꿨다(동작 변화 없음).
- 새 `OpenAiRealNulPersistTest`(PostgreSQL 통합) : 답 조각 · 검색 결과 본문 · 두 파일명에 모두 NUL 이 든 스트림을 실서비스 파서로 읽어 `saveAssistant` 로 넣고, 저장 행 `messages.content`="답입니다" · `status`=complete · `citations.source_name`="매뉴얼.md" · `snippet`="발췌" 를 본다
- `OpenAiRealNulTest` 3번 케이스를 annotation 파일명 · 검색 결과 파일명(단계 라벨 + 스니펫 찾는 열쇠) 두 케이스로 나눴다

## 변이 확인 (`before/mutation.txt`)

| `withoutNul` 을 뺀 곳 | 실패하는 케이스 |
| --- | --- |
| 답 조각 delta | `nul_in_delta…` + 통합 케이스 |
| 검색 결과 text | `nul_in_search_result_text…` + 통합 케이스 |
| annotation 파일명 | `nul_in_annotation_filename…` + 통합 케이스 |
| 검색 결과 파일명 | `nul_in_search_result_filename…` + 통합 케이스 |
| 네 곳 전부 | 다섯 케이스 전부 |

지점 하나를 빼면 그 지점의 케이스 하나와 통합 케이스만 실패한다 — 각 지점이 따로 잠긴다. 변이 뒤 원본으로 되돌렸다(diff 0).

## 검증

- main(#612 · #613 포함)을 합친 뒤 `./mvnw -B verify` : tests 445 · failures 0 · errors 0 (`after/full-verify.txt`) · 케이스 하한 445/445

## 남은 이슈

- 없음. 통합 케이스는 HTTP 채팅 경로 전체가 아니라 파서 → 저장 서비스 구간이다(가짜 OpenAI 서버를 띄운 채팅 통합 지지대가 아직 없음)
