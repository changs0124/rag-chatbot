## #539 전후 리포트 (문서만 · 동작 변화 없음)

구현 `51f9572` · 11파일 +31 / −149줄 · 원자료 `.issue/539/evidence/`(before 원문 10개 · after.txt)

### 바꾼 것
| 문서 | 내용 | 정본 |
|---|---|---|
| requirements · features · api · erd · live-integration · design-system | 머리표(문서 버전 · 최종 수정일 · 작성자 · 런칭일) 삭제 | git · CHANGELOG |
| requirements | 7절 마일스톤 삭제, 3절 주요 사용자 → 2절 이해관계자 표에 병합(절 번호 당김) | CHANGELOG |
| README | 구성도 · Maven 이미지 사유 · 배포 세부 · 케이스 하한 · CI 잡 수 → 포인터 (132 → 106줄) | overview · backend 「배포」 · Dockerfile · CONVENTIONS |
| INDEX:9 | 「CI 7잡」 숫자 제거 | CONVENTIONS |
| CONVENTIONS | 같은 `gh api …/rules/branches/main` 두 절 병합, 케이스 하한 규칙 → 포인터 | `scripts/case-floors.env` 머리 주석 |
| overview | 업로드 한도 · 백업 세부 · 빈 「페이지 URL 맵」 · 데이터 모델 재서술 → 포인터 | yml · features · api · backend · erd |

### 하지 않은 것
- **INDEX:55-59 행동 지침 4줄은 그대로 둔다** — 루트 `CLAUDE.md` 는 `.gitignore` 대상이라 저장소에 없다. INDEX 가 저장소 안 유일한 사본이므로 포인터로 바꾸면 없는 파일을 가리킨다
- `design-system.md` 머리표는 이슈 목록에 없었지만 같은 표라 함께 지웠다

### 검증
- 머리표 칸을 읽는 스크립트 0곳(grep)
- 지운 사실이 정본에 남아 있음 : backend.md 스냅샷 7개 · 오프사이트, application.yml 26MB · 31MB, Dockerfile Maven Central 사유, case-floors.env 규칙, overview 구성도
- `bash scripts/check-all.sh docs` 통과 (섹션 참조 대조 포함) · CHANGELOG [Unreleased] Docs
