## 작업 요약
- `frontend/src/lib/api.ts` 에 `window` `storage` 이벤트 리스너를 추가했다. 다른 탭이 `rag_chatbot_token` 을 지우면 모듈 토큰을 비우고 `onUnauthorized` 로 로그인 화면으로 보내며, 바꾸면 모듈 토큰을 새 값으로 교체한다.
- 이미 저장소가 바뀐 뒤라 `setToken` 으로 다시 쓰지 않고 모듈 변수만 맞춘다(되쓰기 방지가 이 이슈의 핵심).

## 변경 전후
| 상황 | 변경 전 | 변경 후 |
|---|---|---|
| 탭 A 로그아웃 → 탭 B | 모듈 토큰 유지, 재발급 때 localStorage 에 토큰을 다시 씀 | 탭 B 도 로그아웃, 이후 요청에 Authorization 없음 |
| 탭 A 가 토큰 교체 → 탭 B | 탭 B 는 옛 토큰으로 요청 | 새 토큰으로 요청 |
| 다른 키 변경 | - | 무시 |

## 검증 (red → green, totals)
- red : `api.test.ts` 신규 3건 중 2건 실패(`expected "vi.fn()" to be called once, but got 0 times`, `expected 'mine' to be 'theirs'`) — `evidence/before/red-tests.txt`
- green : `api.test.ts` 8건 통과 — `evidence/after/green-tests.txt`
- `npm run lint` 통과, `npm run build` 통과
- `npm test` : 25 파일 / **198 통과** (하한 195 → 198)

## 변경 파일
- `frontend/src/lib/api.ts`
- `frontend/src/lib/api.test.ts`
- `docs/02_architecture/frontend.md` (「API 통신」)
- `docs/06_changelog/CHANGELOG.md`
- `scripts/case-floors.env` (FRONTEND_MIN 198)

## 남은 이슈
- 다른 탭의 `localStorage.clear()` 는 `key === null` 이벤트라 따라가지 않는다(앱은 clear 를 쓰지 않음).
- 서버 쪽 로그아웃(토큰 무효화) API 는 범위 밖.
