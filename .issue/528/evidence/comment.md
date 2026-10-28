## 작업 요약

`deploy.sh` 가 app 헬스(서버 안 `localhost:8080`) 통과 뒤 **터널 준비**도 확인한다. `cloudflared tunnel --metrics 127.0.0.1:20241 ready`(엣지 연결 1개 이상이면 exit 0)를 최대 30초 기다리고, 실패하면 cloudflared 상태 · 로그 꼬리 · 되돌리는 법을 찍고 exit 1 — 옛 이미지 정리 전이라 롤백 자산이 남는다.

배포 스크립트라 화면 캡처 대신 실행 출력으로 남긴다 — `.issue/528/evidence/before.txt` · `after.txt`

## 변경 전후

| 상황 | 전 | 후 |
| --- | --- | --- |
| 터널 정상(운영) | 배포 완료 | 「터널 준비 확인 · OK (0초 경과)」 → 배포 완료 |
| 터널 못 붙음(더미 토큰 재현) | **배포 완료**(바깥에서 끊김) | 30초 뒤 `503 readyConnections:0` · 로그 · 되돌리는 법 → **exit 1** |

운영 터널은 끊지 않았다 — 실패 경로는 로컬 compose 에서, 성공 경로는 운영에 같은 블록을 읽기 전용으로 돌려 확인.

## 변경 파일

- `scripts/deploy.sh` — 5단계(헬스체크) 끝에 터널 준비 블록 · 원격 문자열 규칙(#129 : `#` 금지 · `;` 종결) 준수
- `docs/02_architecture/backend.md` — 배포 절차 5 · 「감수하는 약점」의 정리 조건
- `docs/06_changelog/CHANGELOG.md` — `[Unreleased]` Fixed

## 검증

- `bash -n` · shellcheck · `bash scripts/check-all.sh docs` 통과

## 남은 이슈

- 실제 `deploy.sh` 전체 실행은 다음 배포 때 확인(이번 변경만으로는 운영 반영이 필요 없다 — 개발 PC 에서 도는 스크립트)
