## #559 리포트 — 문서 수치 · 서술 6곳과 주석 9곳 정정

성격 : 문서 · 주석만(동작 변화 없음). 전체 변경은 `.issue/559/evidence/after/diff.patch`.

| 위치 | 전 → 후 | 근거 |
|---|---|---|
| backend.md 「배포」 | 「20MB 13초」가 tarball 처럼 읽힘 → tarball 90MB 남짓, 20MB 는 시험 파일(≈1.5MB/s) | #550 에서 들어간 문장 |
| backend.md 플래그 | `--skip-build` 「전송만」 → 「저장부터」 | deploy.sh 10행 |
| design-system.md | 첨부 실패 패널 `danger` 1.06 → **1.91** | 재계산(흰 이미지 위 `black/75` = #404040), 1.06 은 `black/60` 값 |
| design-system.md | `border-line/canvas` 1.43 → **1.48** | `#D0D2D3` / `#FBFCFE` 재계산 |
| design-system.md | `danger-soft` 사용처 → `components/AdminErrorBanners.tsx` | #541 |
| api.md API-GET-001 | `HEAD` 누락 | SecurityConfig · #520 |
| SnippetPicker.java | 「UI 2줄 클램프」 → 저장 · 표시 길이 201자 | 프론트에 클램프 없음 |
| .env.example · compose(2곳) | 터널 매핑이 app:8080 뿐 → SSH 매핑(#550) 병기 | |
| compose 108 | 비루트 목록에 cloudflared(65532) | |
| deploy.sh 머리 · 4단계 | 로컬 cloudflared(ProxyCommand) · cloudflared 재생성 배포는 SSH 끊김 | #550 |
| TextInputs.java | 현재 호출처 네 곳 병기 | |
| AdminRoleSynchronizer.java | 이 결정의 정본임을 명시, V5 의 사라진 참조는 체크섬 때문에 그대로 | 적용된 Flyway |

검증 : `check-all.sh docs` 통과 · `bash -n scripts/deploy.sh`
