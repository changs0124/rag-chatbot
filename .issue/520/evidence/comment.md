## 작업 요약

인증 없이 여는 헬스체크가 `GET` 만 허용돼 `HEAD /api/health` 가 401 이던 것을, `SecurityConfig` 에 `HEAD /api/health` permitAll 한 줄을 더해 **200** 으로 고친다. 컨트롤러는 GET 매핑에 HEAD 를 자동으로 붙인다. 다른 보호 경로의 HEAD 는 그대로 401 이다.

## 변경 전후

| 항목 | 전 | 후 |
| --- | --- | --- |
| `HEAD /api/health`(토큰 없음) | **401** | **200** |
| `HEAD /api/conversations`(토큰 없음) | 401 | 401 (그대로) |
| 새 테스트 `health_head_is_public` | 실패 (`expected 200 but was 401`) | 통과 |

- 전(운영 c2f8617 재현) : `.issue/520/evidence/before-prod.txt`
- 전(새 테스트를 수정 전 코드에 돌림) : `.issue/520/evidence/before-test.txt`
- 후 : `.issue/520/evidence/after-test.txt` — `AuthFlowTest` 19건 통과

## 변경 파일

- `backend/.../config/SecurityConfig.java` — `HEAD /api/health` permitAll
- `backend/.../controller/AuthFlowTest.java` — 테스트 2건(HEAD 헬스 200 · 보호 경로 HEAD 401)
- `docs/02_architecture/backend.md` — 인가 절 · 헬스체크 문장에 HEAD
- `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env` — 백엔드 하한 416 → 418(이 브랜치 실측. #519 PR #522 와 합치면 다시 실측)

## 검증

- `bash scripts/check-all.sh` 통과 — 백엔드 418/418 · 프론트 308/308
- 운영 확인은 배포 뒤

## 남은 이슈

- #519(PR #522)와 CHANGELOG `[Unreleased]` · `case-floors.env` 가 충돌한다 — merge 때 양쪽 보존 · 하한 실측
