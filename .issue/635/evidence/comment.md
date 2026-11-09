## #635 리포트 — CI 액션 Node 24 판

성격 : CI 설정만(앱 동작 변화 없음).

- `ci.yml` 10곳 : `checkout` v4.4.0 → **v7.0.1**(7곳) · `setup-java` v4.9.1 → **v6.1.0**(1곳) · `setup-node` v4.4.0 → **v7.1.0**(2곳). 40자 SHA + `# vX.Y.Z` 주석 고정(#416) 유지, SHA 는 `gh api repos/actions/<이름>/git/ref/tags/<태그>` 로 확인(셋 다 lightweight → commit)
- 세 판 모두 `action.yml` 의 `runs.using: node24`
- `setup-java` 는 최신 v6.2.0 이 11-04 공개(5일)라 한 판 아래 v6.1.0(10-14)
- 릴리스 노트 대조 : 러너 최소 v2.327.1(호스트 러너 충족) · setup-node v5+ 자동 캐시는 `packageManager` 필드가 있을 때만(frontend/package.json 에 없음) · checkout v6 자격 증명 별도 파일(우리 잡은 push 안 함) · setup-java v6 ESM 전환은 사용자 영향 없음 · `aquasecurity/trivy-action`(composite)은 경고 대상 아님
- CHANGELOG `[Unreleased]` 에 Changed 항목

before / after : `.issue/635/evidence/before/actions.txt`(uses 줄 + CI #908 경고 Node 20 7줄 · setup-java v4 1줄) · `after/actions.txt`(uses 줄 + runtime) · 검증 `check-all.sh quick` · `docs` 통과 · 경고 0건은 PR CI 로그로 확인
