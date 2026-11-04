## #584 리포트 — 잘라 넣은 이력 메시지가 이미지 자리표시자를 잃지 않는다

**변경** — `ChatService.truncateToBudget` 이 끝에 다시 붙일 `suffix` 를 받는다. 첨부가 있는 메시지는 `" (이미지 첨부)"` 몫을 예산에서 빼고 본문만 자른 뒤 ` …(이하 생략)` 뒤에 자리표시자를 다시 붙인다. 합계는 그대로 `floor(남은 예산 × 1.5)` 자 안 — 예산 산술은 #554 · #575 와 같다.

**before** — 새 테스트를 현행 코드에 돌리면 실패 : 잘린 결과가 `"가…(1461자) …(이하 생략)"` 로 끝나 `(이미지 첨부)` 가 없다 (`.issue/584/evidence/before/test-on-main.txt`)

**after** — `ChatHistoryTest` 16/16 (`.issue/584/evidence/after/test-after.txt`) · `./mvnw verify` 436/436 · 문서 게이트 통과

**테스트** — `truncated_message_keeps_image_placeholder` 신규(첨부 메시지가 잘려도 `…(이하 생략) (이미지 첨부)` 로 끝나고 합계 ≤ 예산) · 하한 435 → 436
**문서** — `backend.md` 「대화 이력」 · CHANGELOG [Unreleased] Fixed
**배포** — 필요(코드 변경). 다른 리뷰 후속과 함께 배포 예정
