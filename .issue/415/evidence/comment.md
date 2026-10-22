## 작업 요약
앱은 **DML 만 가진 런타임 계정**, 마이그레이션(Flyway)만 소유자(슈퍼유저)로 접속하게 나눴다.
- `docker-compose.yml` : `DB_USERNAME`/`DB_PASSWORD` = 루트 `.env` 의 `APP_DB_USER`/`APP_DB_PASSWORD`(비우면 옛 구성), `SPRING_FLYWAY_USER`/`PASSWORD` = `POSTGRES_*`
- `db/migration/afterMigrate.sql` : 기동마다 런타임 계정에 테이블 DML · 시퀀스 사용을 주고 `flyway_schema_history` 권한은 거둔다(계정이 없거나 소유자와 같으면 아무것도 안 함)
- 계정 생성은 사람이 한 번(비밀번호가 저장소에 들어가지 않게) — `backend.md` 「런타임 DB 계정」

## 변경 전후
| 항목 | 전 | 후 |
| --- | --- | --- |
| 앱 접속 계정 | `postgres`(슈퍼유저) | `ragapp`(nosuperuser · DML 만) |
| `COPY ... TO PROGRAM` · DDL · 이력 수정 | 가능 | **거부** |
| 통합 테스트 접속 계정 | 컨테이너 슈퍼유저 | **`ragapp`** — 권한이 모자라면 테스트 전체가 깨진다 |

## 검증
- 변경 전 실패 : `before/red-tests.txt` — 런타임 계정으로 접속하자 `permission denied for table users`
- 변경 후 : `RuntimeRolePrivilegeTest` 3건 + 전체 check-all 통과(백엔드 328 / 하한 328)
- compose 해석 : `APP_DB_USER` 비움 → `DB_USERNAME=postgres`, 넣음 → `ragapp` + `SPRING_FLYWAY_USER=postgres`

## 변경 파일
- `docker-compose.yml` · `.env.example` · `backend/src/main/resources/application.yml` · `db/migration/afterMigrate.sql`(신규)
- 테스트 `AbstractPgIntegrationTest`(런타임 계정 접속) · `RuntimeRolePrivilegeTest`(신규 3)
- `backend.md` 「런타임 DB 계정」 · `live-integration.md` 준비물 · CHANGELOG · `case-floors.env`

## 남은 이슈
- 운영 반영 : 계정 생성 SQL → 서버 `.env` → 배포(되돌리기는 두 값을 비우고 재기동)
