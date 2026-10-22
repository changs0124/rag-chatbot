## 작업 요약
슬라이딩 재발급에 **절대 수명 12시간**(`JWT_MAX_SESSION_HOURS`)을 뒀다.
- 로그인 · 비밀번호 변경으로 나가는 토큰에 `auth_time`(최초 인증 시각)을 싣는다
- 재발급(`JwtService.refresh`)은 그 값을 그대로 옮긴다. `auth_time` 부터 12시간이 지나면 `needsRefresh` 가 거짓이라, 지금 토큰이 만료되면 재로그인이다(실효 최대 약 14시간)
- `auth_time` 이 없는 옛 토큰은 `iat` 를 쓴다 — 배포 순간 일괄 로그아웃은 없다. 비밀번호 변경 기준선(`password_changed_at`) 규칙은 그대로다

## 변경 전후
| 상황 | 전 | 후 |
| --- | --- | --- |
| 탈취 토큰을 90분마다 사용 | 무기한 재발급 | 최초 인증 12시간 뒤 재발급 중단 |
| 상한 지난 토큰(유효 기간 안) | 200 + `X-Refresh-Token` | 200, **재발급 헤더 없음** |
| 재발급본의 인증 시각 | 없음(매번 새로 셈) | 원본 `auth_time` 그대로 |
| `auth_time` 없는 옛 토큰 | 재발급 | 재발급, `auth_time` = 원본 `iat` |

## 검증
- 변경 전 실패 : `before/red-tests.txt` — `JwtAbsoluteLifetimeTest` 3건 모두 실패
- 변경 후 통과 : `after/green-tests.txt` (기존 `Jwt*Test` · `AuthFlowTest` · `ProfileFlowTest` 포함)
- `bash scripts/check-all.sh` 통과 : `after/check-all.txt` — **백엔드 322 / 하한 322 · 프론트 191 / 하한 191**
- env 대조 누락 0

## 변경 파일
- `backend/.../security/JwtService.java`(`refresh` · `auth_time`) · `JwtAuthenticationFilter.java`(재발급을 `refresh` 로) · `application.yml` · `backend/.env.example`
- 테스트 : `JwtAbsoluteLifetimeTest`(신규 3) · `JwtSecretLengthContextTest`(프로퍼티 추가)
- `api.md`(v1.6) · `features.md`(v2.6) FEAT-OPS-003 · `backend.md` · `CHANGELOG.md` · `case-floors.env`

## 남은 이슈
- 범위 밖 : 서버 쪽 로그아웃 API, 탭 간 로그아웃 동기화
- 프론트 변경 없음 — 재발급 헤더가 오지 않으면 지금처럼 만료 때 401 → 로그인 화면
- #401 · #402 와 `api.md` · `features.md` 버전 줄 · CHANGELOG · `case-floors.env` 가 겹친다 — 합칠 때 해소, 하한은 실측값으로
- 운영 반영은 백엔드 재배포가 필요하다
