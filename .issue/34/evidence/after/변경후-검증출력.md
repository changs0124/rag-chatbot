# after — 변경 후 (커밋 6dfbc10)

## 검증 출력
```
$ bash scripts/check-doc-refs.sh
참조 수집 198건 · 실재 검사 192건
문서 참조 검사 통과

$ grep -c '](\|http' docs/01_specs/live-integration.md
5
```

## 변경 diff
```diff
 docs/01_specs/live-integration.md | 134 +++++++++++++++++++++++++++++++-------
 docs/02_architecture/backend.md   |   4 +-
 docs/INDEX.md                     |   2 +
 3 files changed, 115 insertions(+), 25 deletions(-)
```
