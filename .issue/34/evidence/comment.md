## 작업 리포트

문서 전용 이슈라 화면 변경이 없다. 캡처 대신 **원인 실증 명령과 전후 대조**를 증거로 남긴다.

브랜치 `docs/34-issue-34` · 커밋 `6dfbc10` · `docs/01_specs/live-integration.md` +134 / `backend.md` +4 / `INDEX.md` +2

---

### 원인 실증

이슈 본문의 네 지점을 명령으로 확인했다. 전부 사실이었다.

```
$ grep -oE "<artifactId>[^<]*</artifactId>" backend/pom.xml | sed 's/<[^>]*>//g' | sort -u
backend flyway-core flyway-database-postgresql java-jwt junit-jupiter
mybatis-spring-boot-starter mybatis-spring-boot-starter-test postgresql
spring-boot-maven-plugin spring-boot-starter-parent spring-boot-starter-security
spring-boot-starter-test spring-boot-starter-validation spring-boot-starter-web
spring-boot-testcontainers spring-security-test
                                        ← dotenv 계열 0건

$ grep -rniE "dotenv|config\.import|spring\.config" backend/pom.xml \
    backend/src/main/resources/application.yml backend/src/main/java
                                        ← 0건

$ grep -rn "env_file" docker-compose.yml
30:    env_file:                        ← backend/.env 의 유일한 소비처

$ sed -n '10p' backend/src/main/resources/application.yml
    url: ${DB_URL:}                     ← 비면 DataSource 구성 실패
```

순환은 코드가 강제한다.

```java
// AdminDocumentService.java:85-88
if (!openAiService.hasSharedVectorStore()) {
    throw new BadRequestException("Vector Store 가 설정되지 않아 업로드할 수 없음 (OPENAI_VECTOR_STORE_ID)");
}
```

문서는 이 경로를 2-1(기동 전)에 배치해 두고, 같은 문서 `:143` 이 2-1 을 이 경로로 하라고 지시하고 있었다.

---

### 전후 대조

**① 절차 순서** — 성립하지 않던 순서를 갈랐다

| | before | after |
|---|---|---|
| 2-1 | Vector Store를 만들고 **문서 1건만 넣는다** | **빈** Vector Store 를 만들고 **ID 만 챙긴다** |
| 2-2 | 백엔드를 `APP_MODE=live` 로 띄운다 | 환경변수를 넣고 띄운다 (+ 임시 비밀번호 로그 안내) |
| 2-3 | (2-1에서 넣은 문서를 묻는다) | **관리자로 로그인해 문서 1건만 올린다** ← 신설 |
| 2-4~2-7 | — | 기존 2-3~2-6 을 한 칸씩 밀었다 |

`:143` 의 `2-1 · 2-6` 참조도 `2-3 · 2-7` 로 함께 옮겼다.

**② 환경변수 주입** — 1-1 절 신설

> **`backend/.env` 는 저절로 읽히지 않는다.** 저장소에 dotenv 로더가 없고 `spring.config.import` 도 걸려 있지 않다. 그 파일을 실제로 소비하는 곳은 `docker-compose.yml` 의 `env_file` 한 곳뿐이다.

`INDEX.md` 실행 절과 `backend.md` 「데모」 1 단계에도 같은 단서를 달았다.

**③ 준비물 표** — 기동을 막는데 표에 없던 둘을 넣었다

```diff
+| **PostgreSQL** | `DB_URL` · `DB_USERNAME` · `DB_PASSWORD` | **기동 실패.** …
+| **JWT 서명 시크릿** | `JWT_SECRET` | **기동 실패**(`JwtService.java:31-33`) …

-**기동을 막는 것은 셋이다** — `APP_MODE` · `OPENAI_API_KEY` · `ALLOWED_EMAIL_DOMAINS`(+ `JWT_SECRET`).
+**기동을 막는 것은 여섯이다** — `APP_MODE` · `OPENAI_API_KEY` · `ALLOWED_EMAIL_DOMAINS` · `JWT_SECRET` ·
+`DB_URL`(+ `DB_USERNAME` · `DB_PASSWORD`).
```

**④ 키 발급·스토어 생성** — 문서 앞머리에 만드는 곳·형태·확인 curl 을 두고, 링크 0건이던 문서에 `backend.md`·`features.md` 경로를 달았다.

**⑤ 진단(3-1)** — 「자료 없음」 하나에 원인이 넷 몰려 있어 화면만으로 갈라지지 않는다. 증상→원인 표와, **원인 메시지가 화면에 안 내려오는 것은 의도된 설계이므로 서버 로그를 본다**는 전제를 명시했다.

---

### 검증

```
$ bash scripts/check-doc-refs.sh
참조 수집 198건 · 실재 검사 192건
문서 참조 검사 통과

$ grep -c '](\|http' docs/01_specs/live-integration.md
5                                       ← before 0건
```

- 준비물 표 각 항목을 `application.yml` 의 `${...}` 및 fail-fast 코드(`AppModeGuard:33-37` · `JwtService:31-33` · `EmailDomainPolicy:35-38`)와 1:1 대조 — 일치
- 새 절차(빈 스토어 → ID 주입 → 기동 → 제품 업로드)는 오늘 mock 실기동에서 확인한 전이와 같다 — 업로드 `201 → in_progress → completed`, SSE `meta·stage×3·token·citations·done`

### 완료 기준 대조

- [x] 처음 보는 사람이 이 문서만으로 완주할 수 있다 — 키 발급·스토어 생성·주입·기동·업로드·검증이 모두 문서 안에 있다
- [x] 문서 순서를 따랐을 때 같은 문서가 금지한 상태에 도달하지 않는다 — 2-1 에서 문서를 넣지 않는다
- [x] 준비물 표와 「기동을 막는 것」 서술이 코드와 일치한다 — 셋 → 여섯

### 건드리지 않은 것

- `live-integration.md:139` 「최대 50MB」 — 사실과 다르나 #35 의 완료 조건에 포함돼 있다. 여기서 고치면 두 PR 이 같은 줄을 만진다
- §5 「문서를 넣는 경로」 본문 — 내용이 이미 옳았다. 순서만 §2 에서 고쳤다
