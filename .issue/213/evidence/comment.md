## 작업 리포트 — #213

**문서만 바뀐 이슈라 화면 캡처는 생략했다.** 화면 동작이 하나도 바뀌지 않아 캡처로 보일 차이가 없다. 대신 낡은 문구를 grep 한 결과와 문서 게이트 결과를 전후로 남긴다(`before.txt` · `after.txt`).

### 바꾼 것 (커밋 `4497641`, 브랜치 `docs/213-launch-docs`)

| 파일 | 전 | 후 |
|------|----|----|
| `README.md` 「배포 준비 상태」 | 데모는 아직 백엔드가 연결되지 않았음 · 로그인부터 실패 | 2026-10-06 런칭 · 운영 중. 계정은 관리자가 발급하므로 계정 없이는 로그인 화면까지만 보인다 |
| `docs/INDEX.md` 「배포 준비 상태」 | 서버만 준비하면 도는 상태 · Root Directory 지정이 남아 있다 | 운영 중 · 저장소 연결과 env 설정 끝남 |
| `frontend.md` 「배포 (Vercel)」 | UI 미리보기(백엔드 미연결) · 저장소 연결 안 됨 | 운영 중 · `main` 푸시가 자동 배포됨(Vercel 프로젝트에서 `git-main` 도메인으로 확인) |
| `current-sprint.md` | 런칭 항목(VM 꺼짐 · #130 · #132 대기) | 진행 중 없음 · 열린 할 일은 #202 |
| `backlog.md` | 런칭 · 실연동 · 스토어 미완료 | 셋 다 `[x]` |
| `backend.md` · `live-integration.md` · `requirements.md` | 「current-sprint 런칭 항목」을 가리킴 | 런칭 완료 + CHANGELOG 로 안내 |
| `CHANGELOG.md` | 런칭 자체를 적은 항목이 없었음 | #213 항목에 런칭 기록을 같이 남김 |

이슈 본문에 없던 다섯 파일(`backend.md` · `live-integration.md` · `requirements.md` · backlog 의 두 줄 · CHANGELOG)도 같이 고쳤다. 앞의 셋은 지운 런칭 항목을 가리키고 있어서 그대로 두면 없는 곳을 안내하게 된다.

### 검증

- 낡은 문구 grep : 전 8건 → 후 1건. 남은 1건은 「런칭 항목이 사라졌다」고 적은 새 문장이다
- `bash scripts/check-all.sh docs` : 실행한 검사 전부 통과(섹션 참조 26건 포함). shellcheck 는 로컬에 없어 건너뜀 — 셸 파일은 바꾸지 않았다

### 남은 확인
- 메인 체크아웃의 `current-sprint.md` 에 아직 커밋하지 않은 수정(「## 완료」 절 4줄)이 있다. 이 PR 과 같은 자리를 건드리므로 merge 전에 어떻게 할지 정한다
