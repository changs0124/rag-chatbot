## 작업 리포트 — compose 에 prod 프로필

브랜치 `fix/305-enable-prod-profile`

### 바꾼 것
- `docker-compose.yml` app : `SPRING_PROFILES_ACTIVE: ${SPRING_PROFILES_ACTIVE-prod}` (`-` 라서 **안 넣으면 prod, 빈 값으로 넣으면 빈 값** — 로컬 목업용 탈출구)
- 루트 `.env.example` 에 주석 한 줄 · `backend.md` 「실행 모드」 · `AppModeGuard` javadoc · CHANGELOG
- `prod` 프로필이 바꾸는 것은 이 검사뿐(`application-prod.yml` · `@Profile` 없음)

### 전후 (로컬 compose, 같은 이미지)

| 조건 | 전 | 후 |
| --- | --- | --- |
| compose config 의 app `SPRING_PROFILES_ACTIVE` | 없음 | `prod` |
| `APP_MODE=mock` · 기본 | **기동됨**(목업) | **기동 실패** 「운영(prod) 프로필에서는 APP_MODE=mock 을 사용할 수 없음」 |
| `APP_MODE=mock` · `SPRING_PROFILES_ACTIVE=` | — | 기동(3.6초) |
| `backend/.env` 그대로(live) · 기본 | 기동 | 기동(4.2초) |

원본 : `.issue/305/evidence/{before,after}/boot.txt`

### 운영 반영
`deploy.sh` 가 이미지와 함께 `docker-compose.yml` 을 보내므로(161행) 다음 배포에 함께 반영된다. 반영 뒤 `docker exec … env` 로 `SPRING_PROFILES_ACTIVE=prod` · 헬스 200 확인.

### 검증
- 문서 게이트(doc-refs · sections · versions) · 셸 구문 통과. Java 는 주석 한 줄뿐
