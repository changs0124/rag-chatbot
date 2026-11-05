## 작업 요약

`OpenAiRealService.listStoreFiles` 가 `/files/{id}` 에서 받은 파일명에도 #610 의 `withoutNul` 을 적용한다. NUL 만 있던 이름은 지우면 빈 이름이라 기존 「파일명 없음」(`IllegalStateException`) 처리로 간다 — 빈 이름 행을 만들지 않는다.

## 변경 전후 (`OpenAiRealStoreFilesTest`, 가짜 OpenAI 서버)

| 케이스 | 수정 전 | 수정 후 |
| --- | --- | --- |
| 파일명 `매뉴\u0000얼.md` → `매뉴얼.md` | **실패** | 통과 |
| 파일명 `\u0000` 만 → 「파일명이 없음」 예외 | **실패**(NUL 은 `isBlank` 가 공백으로 보지 않아 그대로 통과) | 통과 |

- 원본 출력 : `.issue/613/evidence/before/test.txt` · `after/test.txt` · `after/full-verify.txt`

## 검증

- main(#612 포함) 을 합친 뒤 `./mvnw -B verify` : tests 443 · failures 0 · errors 0 · 케이스 하한 443/443 · 문서 검사 통과

## 남은 이슈

- 없음
