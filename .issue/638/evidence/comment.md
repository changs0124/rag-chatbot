## #638 리포트 — 11-09 리뷰 후속 문서 문구

성격 : 문서만(동작 변화 없음).

- `CHANGELOG.md` #635 Changed : setup-java 새 기본값으로 바뀐 동작 넷(`MAVEN_ARGS=-ntp` · 캐시 키 패턴 확장으로 첫 실행 1회 miss · Wrapper 배포본 별도 캐시 · javac problem matcher) · setup-node 자동 캐시가 안 켜지는 이유를 「루트 package.json 없음」으로 정정 · v6.1.0 선택 기준(공개 2주 미만 판 회피)
- `CHANGELOG.md` `[2026-11-09]` 머리 : 「옛 컨테이너 로그(5일치)」 → 「옛 컨테이너에 남아 있던 로그」
- `live-integration.md` #553 관측 : 11-09 `084caaa` 배포 전 `48cc22f` 컨테이너에 남아 있던 로그도 `incomplete` 0
- `[Unreleased]` Docs 항목 추가

before / after : `.issue/638/evidence/before/lines.txt` · `after/lines.txt`(바뀐 줄 원문) · 검증 `check-all.sh docs` 통과
