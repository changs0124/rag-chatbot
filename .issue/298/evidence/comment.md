## 작업 리포트 — 낡은 주석 · 정의 없는 추적 태그 정리

브랜치 `chore/298-stale-comments` · 72파일 +262 / −411 · **주석만**(런타임 문자열 변경 0, CI 스텝 이름 2개 제외)

### 정의 없는 태그 (백엔드 main, Flyway SQL 제외 · 전 → 후)
| 태그 | 전 | 후 |
| --- | ---: | ---: |
| `AC-*` | 37 | 3 |
| `R-*` | 18 | 0 |
| `P-4~10` | 32 | 0 |
| `D-1` · `M*` · `H*` · `N-2` · `이관-*` | 18 | 0 |

- 맞는 현행 ID 가 있으면 바꿈(`REQ-RAG-001~005` · `REQ-CHAT-005/006` · `REQ-OPS-003/004` · `REQ-AUTH-002`), 없으면 태그만 지우고 문장은 남김. 프론트 · 테스트 주석도 같은 규칙
- **남긴 것** : `AppModeGuard` 예외 메시지의 `(AC-18)` 3개 · 테스트 이름/단언 메시지 6개(런타임 문자열) · **Flyway 마이그레이션 SQL 주석**의 `P-4`/`P-6` — Flyway 체크섬이 주석까지 포함해, 고치면 운영 DB 와 검증이 어긋난다(바꾸려면 `flyway repair` 가 따로 필요)

### 틀린 주석 고침 (예)
- `deleteQuietly` 「실패를 보고하지 않는다」 → 연결 해제 실패 시 File 을 남기고 동기화(#193)가 되살림(#271)
- 「UserRepository 가 초로 자른다」 → 호출자(`ProfileService` · `AdminUserService`)가 자름
- 「OpenAI(목업)」 · 「#76 소관」 · 「키가 없어 확인 불가」 · `TODO(M2)` · 가입 시절 서술 · PORT 「Cloud 대응」
- 프론트 : `docFigures`(#270 이후 Markdown 이 그림) · `Logo` mark · `ErrorBoundary` 「런칭 시」 · `ImageLightbox`(실제는 복제) · `Composer` 자리 틀린 주석 · 리뷰 회차 꼬리표
- 인프라 : compose 1GB 시절 근거 · 스왑 경위 2중 → 3줄 + backend.md 링크 · Hikari 「낭비」 → 동시 16 실측 근거 · `ci.yml` 러너 과금(공개 저장소라 무료) · #135 경위 3중 · `check-all.sh` 「종전 CI」 4곳(지금도 CI 가 함) · 게이트 스크립트 개수 · 잡 이름 · 줄 번호 · `deploy.sh` GHCR 근거
- CI 스텝 이름 `런타임 버전 대조(이관-8)` ×2 → `(java)` · `(node)`. **잡 이름은 그대로**(required checks 가 잡 이름을 본다)

### 검증
- `./mvnw clean verify` 287/287 · 프론트 oxlint · tsc · vitest 156/156 · build · 케이스 수 하한 OK
- 문서 게이트 · 셸 구문 · 충돌 표시 · `docker compose config -q`(단독 · build override) · `ci.yml` YAML 파싱 통과
- diff 점검 : 코드 토큰 변경 0(주석 줄 · JSX 주석뿐)
- 원본 : `.issue/298/evidence/{before,after}/tags.txt`
