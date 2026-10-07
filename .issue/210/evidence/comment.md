## 작업 리포트

CI·스크립트 작업이라 화면 캡처 대신 **같은 임시 파일로 게이트를 돌린 출력 전후**를 증거로 남깁니다.
`docs/__probe.md` 에 git 이 남기는 모양 그대로 충돌 표시를 넣고(커밋하지 않음) `bash scripts/check-all.sh docs` 를 돌렸습니다.

| | before (main `6dff835`) | after (`8ac7dec`) |
| --- | --- | --- |
| 결과 | **「돌린 검사는 전부 통과」 · exit 0** | `✗ 병합 충돌 표시` · `docs/__probe.md:2` · `:6` 출력 · **exit 1** |

### 바꾼 것

- `scripts/check-merge-markers.sh`(신규) — 추적 중 + 추적 전 새 파일 전체에서 줄 맨 앞의 `<<<<<<< ` · `>>>>>>> ` · `||||||| ` 를 찾는다. `.gitignore` 는 따르고 바이너리는 건너뛴다. 검사한 파일 수를 출력해 대상이 0 이면 실패한다
- `scripts/check-all.sh` docs 절과 CI `static` 잡 — 문서 참조 검사보다 **먼저** 돈다
- `docs/CONVENTIONS.md` 게이트 목록 · `CHANGELOG.md`

### 범위 결정 — 단독 `=======` 은 일부러 뺐다

이슈는 `^=======$` 도 적었지만 마크다운 setext 제목 밑줄과 모양이 같다. 충돌이면 위아래 표시(`<<<<<<<` · `>>>>>>>`)가 반드시 같이 있으므로 그 둘만 봐도 놓치지 않는다. `Title` + `=======` 파일로 확인 — **오탐 0**.

### 완료 기준

- [x] 표시를 일부러 넣으면 실패하고 파일:줄을 출력한다(음성 대조) — after `01-gate-catches.txt`
- [x] 현재 main 에서 통과한다(오탐 0) — `충돌 표시 검사 통과 (파일 587개)`
- [x] `check-all.sh docs` 와 CI `static` 잡에 들어갔다
- [x] 검사 목록 문서(`CONVENTIONS.md`) 갱신
- shellcheck(컨테이너) `check-merge-markers.sh` · `check-all.sh` → 0건

### 증거

- before : [`01-gate-misses.txt`](EV/before/01-gate-misses.txt)
- after : [`01-gate-catches.txt`](EV/after/01-gate-catches.txt) · [`02-no-false-positive.txt`](EV/after/02-no-false-positive.txt)

증거 파일 안의 충돌 표시는 `  | ` 로 들여썼다 — 줄 맨 앞이 아니라 새 게이트에 걸리지 않는다.

구현 커밋 `8ac7dec` · 브랜치 `chore/210-issue-210`
