## 작업 요약

백엔드에 남은 죽은 코드와 중복을 걷었다. 동작은 바뀌지 않는다(순수 리팩터).

- **B8** `AttachmentRef.fileType` 과 늘 참이던 `"image"` 필터 두 곳을 지웠다. 첨부는 이미지만 저장된다
- **B10** `application.yml` 에서 Boot 4.1 기본값과 같은 Flyway 설정 두 줄(`enabled` · `locations`)을 지웠다. 기본값은 jar 메타데이터로 확인했다
- **B11** `FileService` 의 형식별 최대 크기(전부 10MB)를 상수 하나로 묶었다. 오류 문구는 그대로다
- **B12** `OrphanCleanupScheduler` 의 인라인 cron 기본값을 지웠다. 기본값은 `application.yml` 한 곳에 둔다(#300 규칙)
- **B13** `OpenAiRealService` 의 인라인 검사를 `hasSharedVectorStore()` 로 바꿨다
- **B14** `AdminRoleSynchronizer` ↔ `EmailDomainPolicy` 의 서로 부르는 정적 파서를 `EmailDomainPolicy.parseList` 하나로 모았다. 위임 메서드는 지웠다
- **B16 · B17 · B18** 테스트 대역 중복을 지원 클래스로 모았다. 단언은 그대로다
  - `ChatStreamTestSupport` : 채팅 스트림 대역
  - `OpenAiRealTestSupport` : 생성자 13곳과 타임아웃 상수
  - `SseTestSupport` : `eventNames`

## 검증

| 항목 | 전 | 후 |
| --- | ---: | ---: |
| 백엔드 `mvnw clean verify` | 290(55 스위트) | 297 · main 반영 후 같은 수(58 스위트) |
| 스위트별 테스트 수 | — | 전과 같음. 합치거나 뺀 테스트 없음 |
| Flyway 마이그레이션 실행(로그 「Migrating schema」) | 실행 | 9회 실행 |
| `check-all.sh quick` · `docs` | — | 통과 |

- 리뷰 : 처음에는 REQUEST_CHANGES 였다. 반영한 것
  - 상수를 옮기며 남은 주석 7곳 삭제
  - B14 완료(#327 merge 뒤)
  - `eventNames` 를 공용 지원 클래스로
  - 빈 `flyway:` 키 정리
- 원본 : `.issue/329/evidence/`

## 이슈와 다른 점

- **완료 기준의 `git grep 'fileType()'` 0건은 범위를 좁혔다.** `openai/` · `AttachmentRef` 에서는 0건이다. `ConversationService` 한 곳은 API 응답 필드라 남는 게 맞다
- **로컬 compose 기동은 건너뛰었다.** 이유는 셋이다
  - `application.yml` 이 cron 을 늘 정의하므로(`${ORPHAN_CLEANUP_CRON:0 0 * * * *}`) 인라인 기본값을 지워도 비지 않는다
  - 지운 Flyway 키는 기본값과 같다
  - 모든 통합 테스트가 `application.yml` 로 전체 컨텍스트를 띄운다
- B9(`timedOut`)는 #299 가 일부러 남긴 것이라 다루지 않았다

## 남은 이슈

없음
