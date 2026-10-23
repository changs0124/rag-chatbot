## 작업 요약

2026-10-23 전체 리뷰(4갈래) 후속. 이슈 본문의 요구사항을 반영했다 — 변경 목록은 커밋과 아래 diff 통계.

## 커밋

- `9280ab3` refactor(test): 업로드 헬퍼 · rawChat · 프론트 픽스처 복붙을 정리한다

```
 .../controller/AdminDocumentFlowTest.java          | 27 +----------
 .../controller/AdminDocumentSyncFlowTest.java      | 19 ++------
 .../ragchatbot/controller/AdminUserFlowTest.java   | 16 +++----
 .../ragchatbot/controller/AttachmentQuotaTest.java | 25 ++--------
 .../controller/ChatConversationDeletedTest.java    | 28 ++---------
 .../com/ragchatbot/controller/ChatFlowTest.java    | 18 +------
 .../controller/ChatStreamExceptionHandlerTest.java | 28 ++---------
 .../com/ragchatbot/controller/FileFlowTest.java    | 56 +++++++---------------
 .../ragchatbot/controller/UploadRateLimitTest.java | 18 +------
 .../support/AbstractPgIntegrationTest.java         | 33 +++++++++++++
 .../com/ragchatbot/support/SseTestSupport.java     | 36 +++++++++++++-
 docs/06_changelog/CHANGELOG.md                     |  5 ++
 frontend/src/components/chat/Composer.test.tsx     | 12 +----
 .../components/chat/MessageListLazyFail.test.tsx   | 23 +++------
 frontend/src/hooks/useChatLoading.test.ts          | 21 +-------
 frontend/src/hooks/useChatRace.test.ts             | 21 +-------
 frontend/src/test/fixtures.ts                      | 22 +++++++++
 17 files changed, 150 insertions(+), 258 deletions(-)
```

## 전후 증거

- `duplication.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/455/evidence/before/duplication.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/455/evidence/after/duplication.txt)
- `test-names-backend.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/455/evidence/before/test-names-backend.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/455/evidence/after/test-names-backend.txt)

## 검증

- 관련 테스트 · 문서 검사 통과(구현 보고와 리뷰 반영 뒤 재실행). 백엔드 전체 `./mvnw verify` · `check-all` 은 통합 때 한 번에 돈다(여러 워크트리가 동시에 Testcontainers 를 띄우지 않게)
- 리뷰 : sonnet APPROVE — 요청 · 단언 동치 확인. MessageListLazyFail 은 .catch 제거 시 실패(변이 검증)
