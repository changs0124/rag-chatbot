## #219 작업 리포트 — 죽은 코드·복사본 정리 (동작 변화 없음)

| 대상 | 변경 전 | 변경 후 |
|---|---|---|
| 401·에러 처리 (`api.ts` · `endpoints.ts`) | 같은 8줄 두 벌 | `toApiError` 하나 |
| `AuthContext` 의 `eslint-disable` | 1건(효력 없음) | 0 |
| `AdminPage` 의 `fileInput` ref | 선언만 있고 읽지 않음 | 삭제 |
| 테스트 `afterEach(cleanup)` | 7개 파일에 사본 | `setup.ts` 1곳 |
| `createConversation` / `createAdminUser` | 6벌 / 3벌 | `AbstractPgIntegrationTest` 1벌씩 |
| `AuthService.me` · `ProfileService.me` | 같은 조회 두 벌 | `ProfileService.me` 하나 |
| 쓰지 않는 import | `UploadRateLimitTest` 1건 (+ 헬퍼 이동으로 생긴 3건) | 0 |

27개 파일 · +85 / −145.

**하지 않은 것 (판정)**
- **MIME 매핑 합치기** — `OpenAiRealService` 가 `FileService` 를 import 하면 `service → openai → service` 패키지 순환이 생긴다. 상호 참조 주석과 `toLowerCase(Locale.ROOT)` 만 넣었다
- **`check-all.sh` 의 「도달 불가 `exit`」** — 리뷰가 죽은 코드로 짚었지만 #145 가 남긴 의도된 안전망이다(`summary` 가 exit 를 잃으면 `docs`·`quick` 모드가 전체 실행으로 바뀌는 것을 막음). 그대로 둔다
- 관리·마이 페이지 테스트의 `cleanup()` — 같은 `afterEach` 안에서 타이머·토큰 정리와 순서가 엮여 있어 그대로 둔다(중복 호출은 무해)

**검증** : 백엔드 `./mvnw clean test` 241 통과(전과 같음) · 프론트 lint · vitest 122 · build · `oxlint --report-unused-disable-directives` 경고 0 · 게이트 6종 · 케이스 하한 241/122

화면·응답 변화가 없는 정리라 캡처 대신 대상 실측 원본을 남겼다 : [변경 전 대상](https://github.com/changs0124/rag-chatbot/blob/main/.issue/219/evidence/before/%EB%8C%80%EC%83%81.txt) · [변경 후 결과](https://github.com/changs0124/rag-chatbot/blob/main/.issue/219/evidence/after/%EA%B2%B0%EA%B3%BC.txt)
