Refs #482

## 요약 — 브랜치 `chore/482-test-gaps` (커밋 42b0542 · 7f01747)

### 바꾼 것

- F3 `MessageListLazy` · `MessageListRender` : 청크 import 를 명시적으로 기다리고 타임아웃 10초
- F16 `stream.test` : 프레임 중간 · 줄바꿈 사이 · 한글/이모지 바이트 중간 · 한 바이트씩 4건
- T1 `isNotNull()` → `DataIntegrityViolationException`(`rag_documents_uploaded_by_fkey`) · `DuplicateKeyException`(`uq_rag_documents_alive_file`)
- T2 리라이터 짧은 이름 겹침 경계 2건 · T3 completed flush 로만 나오는 끝 이름 1건
- 제품 코드 변경 없음

### 검증

- 일부러 깬 코드에서 각 단언이 실패함을 확인(T1 제약 이름 · T2 `>2` · T3 flush 제거 · F16 stream:true 제거 · 버퍼 제거). 프론트 캐시 삭제 콜드 3회 연속 226/226 · 백엔드 대상 6클래스 통과
- 리뷰 : opus 리뷰 LOW 3 → 반영

### 증거

[before/mutation-T1.log](https://github.com/changs0124/rag-chatbot/blob/main/.issue/482/evidence/before/mutation-T1.log) · [before/mutation-T2-T3.log](https://github.com/changs0124/rag-chatbot/blob/main/.issue/482/evidence/before/mutation-T2-T3.log) · [before/mutation-F16-no-stream-true.log](https://github.com/changs0124/rag-chatbot/blob/main/.issue/482/evidence/before/mutation-F16-no-stream-true.log) · [before/mutation-F16-no-buffer.log](https://github.com/changs0124/rag-chatbot/blob/main/.issue/482/evidence/before/mutation-F16-no-buffer.log) · [after/frontend-cold-1.log](https://github.com/changs0124/rag-chatbot/blob/main/.issue/482/evidence/after/frontend-cold-1.log) · [after/backend-tests.log](https://github.com/changs0124/rag-chatbot/blob/main/.issue/482/evidence/after/backend-tests.log)

### 미측정 · 한계

- F3 콜드 실패는 이 환경에서 재현하지 못함 — 효과는 CI 에서 확인. T2 의 원래 분기는 기존 테스트가 이미 막고 있었음(리뷰 오판, 새 2건은 그 위 경계)

### 배포

- 없음

> 10-26 전체 리뷰 후속(#479~#488). 통합은 issue-merge 에서 순서대로 · 이슈는 통합 검증 뒤 닫는다.
