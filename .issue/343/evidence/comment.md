## 작업 요약

통합 테스트의 연결 풀을 줄였다.
- 설정이 다른 테스트 컨텍스트는 캐시에 남는다. 컨텍스트마다 Hikari 풀이 기본 10 연결을 붙잡아, 9개 × 10 = 90 이 공유 컨테이너 상한 97 에 거의 닿아 있었다
- `AbstractPgIntegrationTest` 공통 속성에 `spring.datasource.hikari.maximum-pool-size=4` 를 두었다. 최악의 경우 36 연결이다

## 검증

| 항목 | 전 | 후 |
| --- | --- | --- |
| #342 CI `backend` | `FATAL: sorry, too many clients already` 로 컨텍스트 기동 실패(3 errors) | 이 PR 의 CI 로 확인 |
| 로컬 `mvnw clean verify` | 294 통과 | **294 통과(80초)** |
| 동시성 테스트(`ChatBackPressure` · `ChatRejectionCounter` · `ChatSseAcceptRateLimit`) | 통과 | **통과**(1.1 · 0.8 · 0.3초) |
| 최악 연결 수 | 90 / 97 | **36 / 97** |

- 원본 : `.issue/343/evidence/` (전 : #342 CI 실패 줄 · 후 : verify 요약과 전체 로그)

## 변경 파일

- `backend/src/test/java/com/ragchatbot/support/AbstractPgIntegrationTest.java`
- CHANGELOG

## 남은 이슈

- #326(PR #342)을 이 위로 rebase 한다. 그 클래스에만 둔 전용 풀 설정(2)은 그때 걷는다
