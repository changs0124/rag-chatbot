## 작업 요약

2026-10-23 전체 리뷰(4갈래) 후속. 이슈 본문의 요구사항을 반영했다 — 변경 목록은 커밋과 아래 diff 통계.

## 커밋

- `554829a` chore(454): ChatInput 생성자를 public 으로 (인터페이스 안 record)
- `a470e5d` chore(454): ChatInput 생성자에서 null 을 막는다 (리뷰 반영)
- `58acb05` chore(cleanup): 쓰이지 않는 테스트 의존성 · 설정 줄 · 코드를 지운다

```
 .gitignore                                         |  1 -
 .linkignore                                        |  4 ----
 backend/pom.xml                                    | 23 +---------------------
 .../java/com/ragchatbot/entity/RagDocument.java    |  3 +--
 .../com/ragchatbot/openai/OpenAiMockService.java   |  8 ++++----
 .../com/ragchatbot/openai/OpenAiRealService.java   |  6 +++---
 .../java/com/ragchatbot/openai/OpenAiService.java  |  7 +++++++
 .../ragchatbot/service/AdminDocumentService.java   |  4 ++--
 .../resources/mapper/RagDocumentRepository.xml     |  5 ++---
 .../controller/AdminDocumentSyncFlowTest.java      |  2 +-
 .../service/AdminDocumentStatusRefreshTest.java    |  2 +-
 docs/06_changelog/CHANGELOG.md                     |  9 +++++++++
 frontend/src/auth/AuthContext.tsx                  |  2 +-
 13 files changed, 32 insertions(+), 44 deletions(-)
```

## 전후 증거

- `authcontext-eslint-disable.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/before/authcontext-eslint-disable.txt) 
- `chatinput-null-guards.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/before/chatinput-null-guards.txt) 
- `check-all-docs.txt`  [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/after/check-all-docs.txt)
- `compile.txt`  [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/after/compile.txt)
- `dependency-tree-test.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/before/dependency-tree-test.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/after/dependency-tree-test.txt)
- `frontend-lint.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/before/frontend-lint.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/after/frontend-lint.txt)
- `frontend-verify.txt`  [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/after/frontend-verify.txt)
- `gitignore-wrapper.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/before/gitignore-wrapper.txt) 
- `linkignore-vitest.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/before/linkignore-vitest.txt) 
- `pom-deps-grep.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/before/pom-deps-grep.txt) 
- `ragdocument-deletedat.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/before/ragdocument-deletedat.txt) 
- `surefire-summary.txt`  [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/after/surefire-summary.txt)
- `tests-openai.txt`  [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/after/tests-openai.txt)
- `tests.txt`  [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/454/evidence/after/tests.txt)

## 검증

- 관련 테스트 · 문서 검사 통과(구현 보고와 리뷰 반영 뒤 재실행). 백엔드 전체 `./mvnw verify` · `check-all` 은 통합 때 한 번에 돈다(여러 워크트리가 동시에 Testcontainers 를 띄우지 않게)
- 리뷰 : sonnet APPROVE → 권장 반영 : ChatInput 생성자에서 null 차단(public compact constructor)
