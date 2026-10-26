## 결과 리포트 — 브랜치 `fix/479-upstream-error-classes` (커밋 cc8a11f · 2326146)

### 바꾼 것

- `isTransient` : 429(단 `insufficient_quota` 제외) · `UnknownHostException` · `NoRouteToHostException` 을 일시 장애로 — 업로드는 503, 삭제는 재시도
- 스토어 연결 실패 뒤 정리 : 연결 해제 → 해제 결과와 무관하게 File 삭제(업로드 경로만, 사용자 결정). 남은 연결은 동기화가 MISSING 으로 끊는다. File 삭제까지 실패하면 file_id 와 직접 지우는 법을 ERROR 로
- `POST /files` 413 · 415 → 고정 문구 400. **400 은 우리 요청 버그일 수 있어 그대로 폴백 500 + ERROR**(사용자 결정)
- WARN 로그의 업스트림 원문은 JSON 이면 code · message 만, 아니면 앞 300자 · CR/LF 치환
- 문서 : features.md FEAT-ADMIN-002 실패 표(429 재시도가 Retry-After 를 따르지 않는 한계 · 502/504 업로드 틈 · ENETUNREACH 범위 밖) · api.md · backend.md · Javadoc

### 검증

- TC-ADMIN-068 순서 갱신 · 070~075 신규(429 → 503 · DNS → 503 · 413/415 → 400 · 400 → 폴백 · 삭제 429 재시도 · 해제 503×3 에도 File DELETE · insufficient_quota → 폴백). 고치기 전 5건 → 리뷰 반영 뒤 3건 실패를 확인, 고친 뒤 17/17
- 리뷰 : opus 리뷰 MED 5 → 모두 반영(고아 File 퇴보 · insufficient_quota · 400 범위 · 로그 원문 · Javadoc)

### 증거

[before/test-output.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/479/evidence/before/test-output.txt) · [after/test-output.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/479/evidence/after/test-output.txt) · [before/review-test-output.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/479/evidence/before/review-test-output.txt) · [after/review-test-output.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/479/evidence/after/review-test-output.txt) · [after/isTransient-grep.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/479/evidence/after/isTransient-grep.txt)

### 미측정 · 한계

- 운영 재현 없음 — 429 · DNS 실패는 운영에서 만들 수 없어 가짜 OpenAI 서버 테스트로만 확인

### 배포

- 백엔드 배포 필요

> 10-26 전체 리뷰 후속(#479~#488). 통합은 issue-merge 에서 순서대로 · 이슈는 통합 검증 뒤 닫는다.
