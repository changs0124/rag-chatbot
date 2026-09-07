관련 이슈: [#34 docs: live 연동 절차서로는 키 발급부터 첫 응답까지 완주할 수 없다](https://github.com/changs0124/rag-chatbot/issues/34) (통합 테스트 뒤 close)

## 변경 내용

절차서만 따라가면 키 발급부터 첫 인용 응답까지 완주할 수 없던 네 지점을 고친다.

**1-1 절 신설 — 값을 어떻게 넣는가**

`backend/.env` 는 저절로 읽히지 않는다. 저장소에 dotenv 로더가 없고(`backend/pom.xml`) `spring.config.import` 도 걸려 있지 않아, 그 파일을 소비하는 곳은 `docker-compose.yml` 의 `env_file` 한 곳뿐이다. 이것을 적지 않아 `.env` 를 채우고도 `APP_MODE 미설정` 을 받는 경로가 열려 있었다. compose 경로와 `./mvnw` 경로를 갈라 적고, `INDEX.md` 실행 절과 `backend.md` 「데모」 1 단계에도 같은 단서를 달았다.

**§2 투입 절차 재배열**

종전 2-1 은 스토어를 만들며 문서까지 넣으라고 했다. 그런데 문서를 넣는 유일한 경로(5절)가 `OPENAI_VECTOR_STORE_ID` 주입 후 기동을 요구하므로(`AdminDocumentService.java:85-88`) 성립하지 않는 순서였다. 그대로 따르면 같은 문서 `:143-145` 가 금지한 상태 — 대시보드로 올려 관리 화면에서 보이지도 지워지지도 않는 상태 — 에 도달했다.

| | before | after |
|---|---|---|
| 2-1 | 스토어를 만들고 **문서 1건을 넣는다** | **빈** 스토어를 만들고 **ID 만 챙긴다** |
| 2-2 | 백엔드를 띄운다 | 환경변수를 넣고 띄운다 (+ 임시 비밀번호 로그 안내) |
| 2-3 | — | **관리자로 로그인해 문서 1건을 올린다** (신설) |
| 2-4~2-7 | — | 기존 2-3~2-6 을 한 칸씩 밀었다 |

**준비물 표 · 기동 차단 서술**

`DB_URL` 과 `JWT_SECRET` 은 비면 기동이 막히는데 표에 없었고, 그래서 "기동을 막는 것은 셋" 이라는 서술도 거짓이었다. 두 행을 넣고 **여섯**으로 고쳤다.

**키 발급 · 스토어 생성 · 진단**

만드는 곳과 `vs_` 형식, 키 확인 curl 을 문서 앞머리에 뒀다. 링크가 0건이던 문서에 `backend.md` · `features.md` 경로를 달았다. 3-1 에는 증상→원인 표를 뒀다 — 「자료 없음」 하나에 원인이 넷 몰려 있어 화면만으로 갈라지지 않고, 원인 메시지가 화면에 내려오지 않는 것은 의도된 설계이므로 **서버 로그를 본다**는 전제를 명시했다.

## 검증

```
$ bash scripts/check-doc-refs.sh
참조 수집 198건 · 실재 검사 192건
문서 참조 검사 통과

$ grep -c '](\|http' docs/01_specs/live-integration.md
5                                       ← before 0건
```

준비물 표 각 항목을 `application.yml` 의 `${...}` 및 fail-fast 코드(`AppModeGuard:33-37` · `JwtService:31-33` · `EmailDomainPolicy:35-38`)와 1:1 대조해 일치를 확인했다. 새 절차는 오늘 mock 실기동에서 확인한 전이(업로드 `201 → in_progress → completed`, SSE `meta·stage×3·token·citations·done`)와 같다.

## 범위 밖으로 남긴 것

`live-integration.md:139` 의 「최대 50MB」 는 사실과 다르다(실효 25MiB). [#35](https://github.com/changs0124/rag-chatbot/issues/35) 의 완료 조건에 포함돼 있어 건드리지 않았다 — 여기서 고치면 두 PR 이 같은 줄을 만진다.

코드는 변경하지 않았다. 문서 세 파일뿐이다.
