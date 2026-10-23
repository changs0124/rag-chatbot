## 작업 요약

2026-10-23 전체 리뷰(4갈래) 후속. 이슈 본문의 요구사항을 반영했다 — 변경 목록은 커밋과 아래 diff 통계.

## 커밋

- `3d03c43` docs(451): 리뷰 반영 — 참조 · 정본 · 롤백 정보 보정
- `8345dcb` docs(single-source): 같은 사실 반복 · 갈린 정본 문장 · 낡을 수치를 정리한다

```
 README.md                             | 22 +++-------------------
 backend/.env.example                  |  2 +-
 docs/01_specs/live-integration.md     |  4 ++--
 docs/02_architecture/backend.md       |  4 ++--
 docs/02_architecture/design-system.md |  5 ++---
 docs/02_architecture/frontend.md      |  4 ++--
 docs/02_architecture/overview.md      |  6 +++---
 docs/06_changelog/CHANGELOG.md        |  3 +++
 docs/INDEX.md                         |  2 +-
 9 files changed, 19 insertions(+), 33 deletions(-)
```

## 전후 증거

- `check.txt` [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/451/evidence/before/check.txt) [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/451/evidence/after/check.txt)

## 검증

- 관련 테스트 · 문서 검사 통과(구현 보고와 리뷰 반영 뒤 재실행). 백엔드 전체 `./mvnw verify` · `check-all` 은 통합 때 한 번에 돈다(여러 워크트리가 동시에 Testcontainers 를 띄우지 않게)
- 리뷰 : sonnet REQUEST CHANGES → 반영 : 깨진 §7 참조 → §7-1 · 과거 실측 행의 모델명 복원(gpt-6-sol) · CSP 연결/이미지 분리
