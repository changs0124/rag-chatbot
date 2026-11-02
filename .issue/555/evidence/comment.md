## #555 리포트 — 채팅 경로 교차 접근 테스트

성격 : 테스트만(프로덕션 코드 변경 없음). 새 파일 `backend/src/test/java/com/ragchatbot/controller/ChatCrossAccessTest.java`.

| 케이스 | 결과 |
|---|---|
| 남의 `conversationId` 로 `POST /api/chat` | **404** · 그 대화 메시지 0건 · 모델 호출 없음(목 `lastHistory` 불변) |
| 남의 `attachmentIds` 로 `POST /api/chat` | **404**(ChatService 109행 계약) · 첨부 `message_id` null 유지 · 메시지 증가 없음 · 모델 첨부 0 |

**물리는지 확인(변형 시험)** — `.issue/555/evidence/before/mutation-test.txt`
- 첨부 쿼리(`findByIdAndUser` · `lockByIdAndUser`)의 `user_id` 조건 제거 → 첨부 케이스가 404 대신 400 으로 실패
- 대화 쪽 실제 경로인 `lockSharedByIdAndUser` 조건 제거 → 대화 케이스가 404 대신 **200** 으로 실패
- 변형은 모두 되돌림(커밋은 테스트 파일 하나)

after : `.issue/555/evidence/after/test.txt` — 2건 통과. 케이스 하한(`case-floors.env`)은 merge 때 올린다.
