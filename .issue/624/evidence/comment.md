## 작업 요약

`listDocuments` 가 `signal` 을 받고, 관리 문서 폴링만 `AbortSignal.timeout(15초)` 로 끊는다(`POLL_TIMEOUT_MS`). 응답도 실패도 없는 요청 하나가 #615 의 진행 중 표시를 붙잡아 폴링이 멈추던 길을 막는다. 끊긴 폴링은 기존 폴링 실패와 같은 목록 오류 배너로 보이고, 다음 성공에서 걷힌다. 첫 로드 · 다시 시도(`refresh`)는 그대로(타임아웃 없음).

## 변경 전후 (`AdminDocumentsPage.test.tsx`)

| 케이스 | 수정 전 | 수정 후 |
| --- | --- | --- |
| 응답 없는 폴링 → 타임아웃 신호로 끊김 → 다음 틱에 다시 보냄 | **실패**(2 vs 3 — 다시 안 보냄) | 통과 |

- 원본 출력 : `.issue/624/evidence/before/test.txt` · `after/test.txt`
- 화면 캡처는 생략 — 요청 수로만 갈린다

## 검증

- main 을 합친 뒤 lint · vitest **338** passed · build 통과 · 케이스 하한 338
- 비판 리뷰(opus) proceed — `AbortSignal.timeout` 은 이미 `useChat` 이 쓰는 API, 수동 새로고침은 그대로

## 남은 이슈

- 없음
