## 작업 요약

런칭 절차를 옛 위치(`backlog.md`)로 안내하던 두 줄을 정본(`current-sprint.md` 「진행 중」의 런칭 항목)으로 돌렸다. 문서 변경뿐이라 캡처는 없다.

## 변경 전후

| 위치 | 전 | 후 |
| --- | --- | --- |
| `README.md:50` 데모 안내 | 「절차는 `docs/04_tasks/backlog.md` 의 런칭 항목」 | 「남은 준비물과 순서는 `current-sprint.md` 「진행 중」의 런칭 항목」 |
| `docs/INDEX.md:47` 배포 준비 상태 | 「정해야 할 것과 남은 항목은 `backlog.md`」 | `current-sprint` 「진행 중」의 런칭 항목 (링크) |

**그대로 둔 것** : `README.md:60` 「남은 항목은 backlog.md」 · `INDEX.md` 문서 표의 Backlog 링크 — 둘 다 **착수 전 항목** 안내라 맞다.

원본 : `.issue/185/evidence/before/links.txt` · `after/links.txt`

## 검증

- `scripts/check-all.sh` 통과 (문서 참조 · 섹션 참조 포함) — shellcheck · gitleaks · trivy 는 로컬에 없어 돌지 않았다

## 남은 이슈

없음
