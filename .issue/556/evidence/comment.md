## #556 리포트 — 늦은 401 이 새 세션을 지우지 않게

`frontend/src/lib/api.ts` — `authFetch` 가 응답마다 **보낸 토큰**을 `WeakMap` 에 기록하고, `toApiError` → `handleUnauthorized(path, sentWith)` 는 보낸 토큰이 지금 토큰과 같을 때만 로그아웃한다(재발급 헤더 #363 과 같은 비교). `request` · 채팅 스트림 · 그림 로드가 모두 `authFetch` 를 거쳐 호출부 변경 없음.

- 토큰 없이 보낸 요청(null)은 지금도 null 일 때만 기존 처리, 그사이 로그인했다면 무시
- `authFetch` 를 거치지 않은 Response 는 지금 토큰으로 비교(옛 동작)

테스트(`refresh.test.ts` +4) : 늦은 401 이 새 세션을 지우지 않음 — 래퍼 · 채팅 스트림 · 그림 로드 3경로, 지금 토큰으로 보낸 401 은 그대로 로그아웃
- before(수정 전 코드) : 새 테스트 3건 실패 — `.issue/556/evidence/before/test.txt`
- after : lint · 312 테스트 · build 통과 — `.issue/556/evidence/after/test.txt`

문서 : `frontend.md` 401 처리 항목.
