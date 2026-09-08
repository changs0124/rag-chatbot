## 작업 요약

`AdminDocumentService.upload` 에 보상을 넣었다. `insert` 가 실패하면
`openAiService.deleteDocument(...)` 로 OpenAI 쪽을 되돌리고 **원래 예외는 그대로 다시 던진다.**

## 변경 전후 — 보상 호출 여부

화면이 없는 변경이라 캡처가 아니라 **호출 관측**이 증거다. 통합 테스트로는 DB insert 실패를
결정적으로 만들 수 없어 단위 테스트로 갔다 — `OrphanCleanupSchedulerTest` 와 같은 이유·같은 방식.

| 케이스 | 전 | 후 |
|---|---|---|
| `insert` 실패 → `deleteDocument` 호출 | **불리지 않음 (FAILED)** | **호출됨 (PASSED)** |
| 재조회 실패 → `deleteDocument` 미호출 | PASSED | PASSED — 그대로 |

전 상태의 실패 메시지가 문제를 그대로 보여준다.

```text
Wanted but not invoked:
openAiService.deleteDocument("vs-shared", "file-abc");

However, there were exactly 2 interactions with this mock:
  openAiService.hasSharedVectorStore();        AdminDocumentService.java:125
  openAiService.uploadDocument(...);           AdminDocumentService.java:153
```

`uploadDocument` 로 **만들기까지는 했는데 되돌리는 호출이 없다** — 이 이슈의 전부다.

원본 : [전](../blob/main/.issue/72/evidence/before/compensation.txt) · [후](../blob/main/.issue/72/evidence/after/compensation.txt)

## 왜 이 모양인가

**안쪽 한 겹에는 이미 보상이 있었다.** `OpenAiRealService.uploadDocument` 는 `/files` 성공 후
스토어 연결이 실패하면 파일을 지운다. 없던 것은 **그 바깥 한 겹**(DB 기록)이라 같은 패턴을 한 번 더 둘렀다.

`deleteDocument` 를 고른 이유는 `deleteQuietly` 기반이라 **절대 던지지 않기 때문**이다.
보상 중에 2차 예외가 나서 원래 예외를 덮는 일이 구조적으로 없다.

**재조회(`:159`)는 보상 대상이 아니다.** insert 가 성공한 뒤라 여기서 파일을 지우면
「행은 있는데 파일이 없는」 **반대 방향의 불일치**가 된다. 두 번째 테스트가 이 경계를 잠근다.

`@Transactional` 로는 못 푼다 — 외부 HTTP 호출은 트랜잭션에 묶이지 않는다. 보상이 정답인 이유다.

## 변경 파일

- `backend/src/main/java/com/ragchatbot/service/AdminDocumentService.java` — try/catch 보상 + 근거 주석.
  되돌리기까지 실패할 경우를 위해 `file_id` 를 경고 로그에 남긴다
- `backend/src/test/.../AdminDocumentUploadCompensationTest.java` — 신규 2건, 경계를 양방향으로 잠금
- `docs/04_tasks/backlog.md` — 해소되어 항목 제거
- `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env` (187 → 189)

## 검증

```text
./mvnw -o clean verify        189 통과 · BUILD SUCCESS   (Testcontainers 실 PostgreSQL)
check-case-floor.sh backend   실측 189 / 하한 189  OK
check-doc-refs.sh · check-doc-sections.sh · check-response-contract.sh  OK
```

## 범위 밖으로 둔 것

**스케줄러에 OpenAI 회수 경로를 넣지 않았다.** 이미 생긴 고아를 줍는 일은 별개이고,
OpenAI 쪽 목록 조회 API 가 필요해 **실키 없이는 검증할 수 없다.** 이 PR 은 새 고아가
생기는 것을 막는 데까지다.

## 남은 것

없다. 완료 조건 다섯을 모두 채웠다.

- [x] `insert` 실패 시 `deleteDocument` 로 되돌린다
- [x] 되돌리기 실패에 대비해 `openaiFileId` 를 경고 로그에 남긴다
- [x] 원래 예외를 삼키지 않는다
- [x] 테스트로 잠근다
- [x] 재조회 실패에는 보상이 걸리지 않는 것도 함께 잠근다
