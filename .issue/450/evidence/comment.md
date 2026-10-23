## 작업 요약

2026-10-23 전체 리뷰(4갈래) 후속. 이슈 본문의 요구사항을 반영했다 — 변경 목록은 커밋과 아래 diff 통계.

## 커밋

- `3f8106a` docs(450): 리뷰 반영 — 참조 · 정본 · 롤백 정보 보정
- `f9d2ce4` docs(changelog): current-sprint 끝난 일지를 지우고 [Unreleased] 를 배포별로 나눈다

```
 docs/04_tasks/current-sprint.md | 28 ++++-------------------
 docs/06_changelog/CHANGELOG.md  | 50 +++++++++++++++++++++++++++++------------
 2 files changed, 40 insertions(+), 38 deletions(-)
```

## 전후 증거

- `structure.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/450/evidence/before/structure.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/450/evidence/after/structure.txt)
- `unreleased-lines.sorted.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/450/evidence/before/unreleased-lines.sorted.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/450/evidence/after/unreleased-lines.sorted.txt)

## 검증

- 관련 테스트 · 문서 검사 통과(구현 보고와 리뷰 반영 뒤 재실행). 백엔드 전체 `./mvnw verify` · `check-all` 은 통합 때 한 번에 돈다(여러 워크트리가 동시에 Testcontainers 를 띄우지 않게)
- 리뷰 : sonnet COMMENT — 운영 주의 줄을 롤백 정보로 · #427 롤백 `prev-ad55f58` 보강 반영. 본문 줄 정렬 비교 일치(이동만)
