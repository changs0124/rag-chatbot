## 작업 요약

2026-10-23 전체 리뷰(4갈래) 후속. 이슈 본문의 요구사항을 반영했다 — 변경 목록은 커밋과 아래 diff 통계.

## 커밋

- `18287d2` docs(456): 단계 큐 위임을 아키텍처 표에 적고 넘침 경로 조건을 기록한다 (리뷰 반영)
- `5e2494b` refactor(chat): 200 전 중단 판정 · 단계 큐 · 카드 폐기 · 이름 상한을 묶는다

```
 docs/02_architecture/frontend.md          |   6 +-
 docs/02_architecture/overview.md          |   2 +-
 docs/06_changelog/CHANGELOG.md            |   9 ++
 frontend/src/components/chat/Composer.tsx |  32 +++---
 frontend/src/hooks/useChat.ts             | 155 ++++++++++++++----------------
 frontend/src/hooks/useStageQueue.ts       |  43 +++++++++
 frontend/src/lib/limits.ts                |   3 +
 frontend/src/pages/AdminPage.tsx          |   5 +-
 frontend/src/pages/MyPage.tsx             |   5 +-
 9 files changed, 149 insertions(+), 111 deletions(-)
```

## 전후 증거

- `composer-discard.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/456/evidence/before/composer-discard.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/456/evidence/after/composer-discard.txt)
- `line-counts.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/456/evidence/before/line-counts.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/456/evidence/after/line-counts.txt)
- `name-maxlength.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/456/evidence/before/name-maxlength.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/456/evidence/after/name-maxlength.txt)
- `run-structure.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/456/evidence/before/run-structure.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/456/evidence/after/run-structure.txt)
- `test-run.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/456/evidence/before/test-run.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/456/evidence/after/test-run.txt)

## 검증

- 관련 테스트 · 문서 검사 통과(구현 보고와 리뷰 반영 뒤 재실행). 백엔드 전체 `./mvnw verify` · `check-all` 은 통합 때 한 번에 돈다(여러 워크트리가 동시에 Testcontainers 를 띄우지 않게)
- 리뷰 : opus APPROVE — 불변식(세대 확인 · streaming 유지 · 409/404/그 밖) 유지 확인. 문서 2줄 · 넘침 경로 조건 기록 반영
