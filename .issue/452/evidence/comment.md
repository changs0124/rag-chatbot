## 작업 요약

2026-10-23 전체 리뷰(4갈래) 후속. 이슈 본문의 요구사항을 반영했다 — 변경 목록은 커밋과 아래 diff 통계.

## 커밋

- `594a582` chore(452): 주석 닫는 표시 앞 공백 (리뷰 반영)
- `67d1e54` docs(comment): 지시문 실측 로그를 문서로 옮기고 낡은 · 중복 · 이력 주석을 정리한다

```
 .../main/java/com/ragchatbot/dto/AdminDtos.java    |  2 +-
 .../src/main/java/com/ragchatbot/dto/ChatDtos.java |  2 +-
 .../com/ragchatbot/exception/ApiExceptions.java    |  2 +-
 .../com/ragchatbot/openai/OpenAiMockService.java   |  2 +-
 .../com/ragchatbot/openai/OpenAiRealService.java   | 75 +++++++---------------
 .../java/com/ragchatbot/openai/OpenAiService.java  |  2 +-
 .../repository/AttachmentRepository.java           |  2 +-
 .../java/com/ragchatbot/security/JwtService.java   |  2 +-
 .../ragchatbot/service/ChatConcurrencyLimiter.java |  2 +-
 .../java/com/ragchatbot/service/ChatService.java   |  2 +-
 .../java/com/ragchatbot/service/FileService.java   |  2 +-
 .../com/ragchatbot/service/RateLimiterService.java |  2 +-
 .../src/main/resources/mapper/UserRepository.xml   |  2 +-
 .../openai/OpenAiRealStreamingSpikeTest.java       |  4 +-
 .../repository/UserRepositoryUuidTest.java         |  2 +-
 .../ragchatbot/service/ChatStreamAbortTest.java    |  4 +-
 .../support/AbstractPgIntegrationTest.java         |  4 +-
 docs/01_specs/live-integration.md                  | 14 ++++
 docs/06_changelog/CHANGELOG.md                     |  8 +++
 frontend/src/components/chat/Markdown.tsx          | 36 +++++------
 frontend/src/components/chat/Sidebar.tsx           |  4 +-
 frontend/src/hooks/useChat.ts                      | 12 ++--
 frontend/src/pages/ChatPage.tsx                    | 12 ++--
 scripts/check-all.sh                               |  2 +-
 26 files changed, 105 insertions(+), 114 deletions(-)
```

## 전후 증거

- `instructions-javadoc.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/452/evidence/before/instructions-javadoc.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/452/evidence/after/instructions-javadoc.txt)
- `live-integration-lines.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/452/evidence/before/live-integration-lines.txt) 
- `stale-comment-grep.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/452/evidence/before/stale-comment-grep.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/452/evidence/after/stale-comment-grep.txt)

## 검증

- 관련 테스트 · 문서 검사 통과(구현 보고와 리뷰 반영 뒤 재실행). 백엔드 전체 `./mvnw verify` · `check-all` 은 통합 때 한 번에 돈다(여러 워크트리가 동시에 Testcontainers 를 띄우지 않게)
- 리뷰 : sonnet APPROVE — 주석 제거 후 코드 동일(스크립트 대조) · 실측 수치 전부 문서 표로 이관 확인. 공백 1건 반영
