## 작업 요약

`docs/04_tasks/current-sprint.md` 「운영 주의」를 오늘(10-26) 백엔드 배포에 맞췄다.
- 운영 `a89fb83` · 롤백 이미지 `prev-20f26b3`(운영 서버 태그와 같음)
- 「— #449 merge 뒤」 시점 표현을 지우고 정본 참조만 남겼다
- 「프론트를 먼저 되돌린다」는 #447 이전 이미지(`prev-056ba4c` 이하)로 되돌릴 때만 해당한다. `prev-20f26b3` 에는 #447 이 이미 들어 있어서 그렇게 범위를 적었다
- 같은 배포 사실이라 `CHANGELOG.md` 에 `[2026-10-26]` 배포 구획을 함께 만들었다. #450 규칙(배포별 구획)을 따른 것이고, 항목 본문은 그대로다

## 완료 기준

- [x] `grep -n '#449 merge 뒤' docs/` 0건
- [x] 「운영 주의」 의 롤백 이미지가 운영 서버 태그와 같다(`prev-20f26b3` = `de167886`)
- [x] `bash scripts/check-all.sh docs` 통과

원본 기록 : [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/465/evidence/before/docs-state.txt) · [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/465/evidence/after/docs-state.txt)

문서만 바꿨다. 코드 · 운영 영향은 없다. 커밋 `052cad9` · 브랜치 `docs/465-sprint-ops-note-deploy`
