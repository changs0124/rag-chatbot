## 작업 요약

2026-10-23 전체 리뷰(4갈래) 후속. 이슈 본문의 요구사항을 반영했다 — 변경 목록은 커밋과 아래 diff 통계.

## 커밋

- `cf6ddbd` docs(449): 리뷰 반영 — 참조 · 정본 · 롤백 정보 보정
- `4ea8b2b` docs(api): 코드와 어긋난 문서 서술 넷을 바로잡는다

```
 docs/01_specs/api.md             | 10 ++++++----
 docs/01_specs/features.md        |  3 +--
 docs/02_architecture/backend.md  |  4 ++++
 docs/02_architecture/frontend.md | 12 ++++++------
 docs/06_changelog/CHANGELOG.md   |  6 ++++++
 frontend/src/lib/api.ts          | 12 ++++++------
 6 files changed, 29 insertions(+), 18 deletions(-)
```

## 전후 증거

- `doc-facts.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/449/evidence/before/doc-facts.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/449/evidence/after/doc-facts.txt)

## 검증

- 관련 테스트 · 문서 검사 통과(구현 보고와 리뷰 반영 뒤 재실행). 백엔드 전체 `./mvnw verify` · `check-all` 은 통합 때 한 번에 돈다(여러 워크트리가 동시에 Testcontainers 를 띄우지 않게)
- 리뷰 : sonnet APPROVE — 빈 줄 · api.md 를 backend.md 링크로(정본 한 곳) 반영
