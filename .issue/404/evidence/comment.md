## 작업 요약
`frontend/vercel.json` 에 `headers` 를 더해 모든 경로에 보안 헤더를 붙였다. CSP 는 **Report-Only** 로 먼저 올렸다 — 위반을 콘솔에만 남기고 막지 않는다.

## 변경 전후 (`curl -I`, 원본은 `before/prod-headers.txt` · `after/preview-headers.txt`)
| 헤더 | 전 (운영 `/admin`) | 후 (preview `/` · `/admin`) |
| --- | --- | --- |
| `X-Frame-Options` | 없음 | **`DENY`** |
| `X-Content-Type-Options` | 없음 | **`nosniff`** |
| `Referrer-Policy` | 없음 | **`strict-origin-when-cross-origin`** |
| `Content-Security-Policy-Report-Only` | 없음 | **있음** (`frame-ancestors 'none'` 포함) |
| `Strict-Transport-Security` | 있음(Vercel 기본) | 그대로 |

preview 는 Vercel 보호가 걸려 있어 임시 공유 링크로 받았다(링크 토큰은 증거에 남기지 않음).

## 검증
- `vercel.json` JSON 파싱 · `bash scripts/check-all.sh docs` 통과
- preview 응답 헤더 4종 확인(위 표)
- **미검증** : 화면별 CSP 위반 여부 — preview 출처는 백엔드 CORS(`ALLOWED_ORIGINS`)에 없어 로그인 · 채팅 · 첨부 · 문서 그림 · 관리자 흐름을 preview 에서 돌릴 수 없다. Report-Only 라 운영에 올라가도 막는 것이 없으므로, 운영 반영 뒤 콘솔에서 위반 0 을 확인하고 강제 전환을 후속으로 한다

## 변경 파일
- `frontend/vercel.json`
- `docs/02_architecture/frontend.md` 「배포 (Vercel)」 — 헤더 표 · CSP 에 박힌 백엔드 주소(`https://api.chseong.fyi`)를 `VITE_API_BASE_URL` 과 같이 바꿔야 한다는 주의
- `CHANGELOG.md`

## 남은 이슈
- CSP 강제 전환(`Content-Security-Policy`) — 운영에서 위반 0 확인 뒤
- 프론트는 merge 시 Vercel 자동 배포, 백엔드 배포 불필요
