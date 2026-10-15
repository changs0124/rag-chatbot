## 작업 리포트 — GET /api/profile 제거

| 요청 | 전 | 후 |
| --- | --- | --- |
| `GET /api/profile`(유효 토큰) | 200 | **404** |
| `GET /api/auth/me` | 200 | 200 |

- 전 : 로컬 앱 실측 · 후 : `ProfileFlowTest.get_profile_route_is_gone`(실 Postgres 컨텍스트). 원본 `.issue/303/evidence/{before,after}/probe.txt`
- 이 경로를 쓰던 테스트 3곳을 `/api/auth/me` 로 옮겼다 — 비밀번호 변경 뒤 **새 토큰이 쓸 수 있는가** 검증은 그대로(#105 §6 이 남긴 이유가 이것이었다)
- `api.md` API-GET-003 은 ID 를 남기고 「제거됨」. 백엔드 하한 286 → 287(실측)
- `./mvnw clean verify` 통과 · 문서 게이트 통과
