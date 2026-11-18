## 작업 요약

11-15 뒤 공개된 경보로 필수 체크 `deps (프론트 의존성 취약점)` 가 모든 PR 에서 실패했습니다(예 : #715).
vitest 를 올려 풀 수 있는 것은 풀고, **고친 판이 없는 picomatch 경보 하나만** 기한 · 사유를 적은 예외로 넘기는 게이트를 넣었습니다.

## 전후

| 지표 | 전 | 후 |
| --- | ---: | ---: |
| `npm audit` 경보 | 7 (high 6 · moderate 1) | **6 (high 6)** |
| 그중 원본 경보 | 3 (picomatch 1 · @vitest/mocker 2) | **1 (picomatch)** |
| deps (프론트) 게이트 | exit 1 | **exit 0 (예외 ~2026-12-31)** |

- @vitest/mocker 2건(GHSA-qxg6-89mg-rqv8 · GHSA-xp26-3454-mjgp) : vitest 4.1.11 → 4.1.12 로 해소. lock 변화는 vitest · @vitest/* 8개의 4.1.11 → 4.1.12 뿐
- picomatch(GHSA-fc5q-39xc-vjpf) : 최신 4.0.7 까지 영향 범위라 lock 으로는 못 풉니다. `npm audit fix --force` 는 vite 를 6.2.7 로 내려 쓸 수 없습니다. vite · vitest 의 빌드 · 테스트 시점 글롭에만 쓰이고 패턴은 저장소 설정에서만 오며, 배포 번들 · 서버에는 없습니다
- 남은 high 6건은 모두 이 picomatch 경보를 물려받은 상위 패키지(fdir · tinyglobby · vite · vitest · @vitejs/plugin-react)입니다

## 게이트 동작(음성 대조 포함)

| 경우 | 결과 |
| --- | --- |
| 지금 lock + 허용 목록 | 통과(exit 0) |
| 허용 목록 비움 | **실패**(exit 1, 「허용 목록에 없음」) |
| until 을 어제로 | **실패**(exit 1, 「예외 만료」) |
| 목록에 있는데 더는 안 잡힘 | 통과 + 「지운다」 안내 |

원문 : `.issue/716/evidence/before/npm-audit.txt` · `after/npm-audit.txt` · `after/gate.txt`

## 변경 파일

- `frontend/package.json` · `package-lock.json` — vitest `^4.1.12`
- `scripts/check-npm-audit.mjs`(신규) · `frontend/audit-allowlist.json`(신규, 경보 1건 · 2026-12-31)
- `.github/workflows/ci.yml` deps-frontend 단계 · `scripts/check-all.sh` — 새 게이트 호출. **잡 `name:` 은 그대로**(ruleset context)
- `docs/CONVENTIONS.md` 「테스트·CI 게이트」 예외 규칙 · CHANGELOG

## 검증

- 프론트 lint · test 426/426 · build 통과
- `check-all.sh docs` · `quick` 통과

## 남은 일

- picomatch 고친 판이 나오면 lock 을 갱신하고 허용 목록 항목을 지웁니다(게이트가 「더는 안 잡힘」으로 알려 줍니다). 2026-12-31 이 지나면 다시 실패해 재검토를 강제합니다
