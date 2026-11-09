## #640 리포트 — gitleaks 내려받기 재시도

성격 : CI 설정만(앱 동작 변화 없음).

- `ci.yml` secrets 잡 gitleaks 설치 : `curl -fsSLo …` 에 `--retry 5 --retry-delay 10 --retry-connrefused` + 이유 주석 두 줄. 버전 · SHA256 검증은 그대로
- 로컬 시험(`after/local-test.txt`) : 정상 주소 200 · 체크섬 OK / 없는 주소 404 는 재시도 없이 즉시 실패(0초) / 503 은 재시도 후 실패(`--retry 2` 로 3번 시도 · 4초)
- CHANGELOG `[Unreleased]` Changed 항목

before / after : `.issue/640/evidence/before/step.txt` · `after/step.txt`(설치 단계 원문) · 검증 `check-all.sh quick` 통과
