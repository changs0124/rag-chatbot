관련 이슈 #64

## 결론

**deprecation 4건 → 0건.** #63 의 9건까지 합쳐 **13건이 전부 사라졌다.** 184건 그대로 통과.

## 바꾼 것 — 3파일 8줄

```text
LocalFileStorage.java:44           PathResource → FileSystemResource
GlobalExceptionHandler.java:76     PAYLOAD_TOO_LARGE → CONTENT_TOO_LARGE
AbstractPgIntegrationTest.java:47  org.testcontainers.containers → org.testcontainers.postgresql
```

`PathResource` 만 성격이 달랐다 — `deprecated` 가 아니라 **`marked for removal`** 이라 다음 Spring 메이저에서 경고가 아니라 **컴파일 실패**가 된다.

## Testcontainers 2 는 제네릭이 아니다

패키지만 옮겼더니 깨졌다.

```text
[ERROR] type org.testcontainers.postgresql.PostgreSQLContainer does not take parameters
```

자기 타입 파라미터가 사라져 `<?>` 도 함께 걷었다. **이 클래스는 통합 테스트 18개의 뿌리**라 가장 조심한 곳인데 184건 그대로 통과한다.

## 응답 코드 문자열은 건드리지 않았다

```java
ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE)
        .body(new ApiError("PAYLOAD_TOO_LARGE", "업로드 용량 한도 초과"));
```

상수 이름만 바뀌었다. `code` 는 `api.md:79` 의 계약이라 그대로다 — **다음 사람이 "일관성" 을 이유로 함께 바꾸지 않도록 코드 옆에 이유를 적었다.** 둘 다 413 인 것은 실측했다.

## 413 테스트를 넣으려다 다른 것을 발견했다

완료 기준이 "응답이 여전히 413 인지 **테스트로 확인**" 이었다. 먼저 확인한 것은 **413 경로를 잠그는 테스트가 하나도 없다**는 사실이다(`TC-ADMIN-025` 는 그 반대인 400 을 단언한다).

26MB+1KB 업로드 테스트를 넣어 봤더니 이렇게 됐다.

```text
Caused by: java.io.IOException: chunked transfer encoding, state: READING_LENGTH
```

**Tomcat 이 한도 초과 시 남은 본문을 삼키지 않고 연결을 끊는다.** `server.tomcat.max-swallow-size` 미설정(기본 2MB)이라, 그보다 많이 넘긴 요청은 **클라이언트가 413 을 읽지 못한다.** 즉 `api.md:79` 가 약속한 413 이 현실적인 초과량에서는 **관측되지 않는다.**

**테스트를 뺐다.** 원인이 이 이슈와 다르고(상수 교체가 만든 게 아니라 원래 그랬다), 고치려면 큰 본문을 끝까지 읽는 **런타임 동작 변경**이 필요하다. deprecation 정리에 섞을 판단이 아니다. `backlog.md` 에 실측 근거와 고를 것(설정을 올릴지 / 관측되지 않음을 `api.md` 에 적을지)을 남겼다.

## 완료 기준 대조

- [x] `PathResource` → `FileSystemResource(Path)`
- [x] `PAYLOAD_TOO_LARGE` → `CONTENT_TOO_LARGE`, 413 유지 — **다만 테스트가 아니라 실측으로 확인**(위 사유)
- [x] `PostgreSQLContainer` 대체 API 로 교체
- [x] deprecation 4건 사라짐 → **전체 0건**
- [x] 184건 그대로
- [x] 옮기면 동작이 바뀌는 것이 있으면 고치지 말고 이유를 적는다 → **413 테스트가 그 경우다. 백로그에 남겼다**
- [x] `CHANGELOG.md`

## 증거

- [남은 deprecation (변경 전)](../blob/main/.issue/64/evidence/before/남은-deprecation.md)
- [변경 후 검증](../blob/main/.issue/64/evidence/after/변경후-검증.md)
