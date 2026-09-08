# 변경 전 — 남은 deprecation 4건

측정 커밋 : `origin/main` (`d8a8ddd`, #63 merge 직후)
명령 : `./mvnw clean test-compile -Dmaven.compiler.showDeprecation=true`

```text
GlobalExceptionHandler.java:[76,56]    PAYLOAD_TOO_LARGE in HttpStatus has been deprecated
LocalFileStorage.java:[44,28]          PathResource has been deprecated and marked for removal
AbstractPgIntegrationTest.java:[47,22] PostgreSQLContainer has been deprecated (타입)
AbstractPgIntegrationTest.java:[47,60] PostgreSQLContainer has been deprecated (생성자)
```

#63 이 `asText` 9건을 없앤 뒤 남은 것들이다.

## `PathResource` 만 성격이 다르다

`deprecated` 가 아니라 **`deprecated and marked for removal`** 이다. 다음 Spring 메이저에서 경고가 아니라 **컴파일 실패**가 된다. 나머지 셋은 아직 시간이 있다.

## 대체제를 미리 확인했다

```text
FileSystemResource            spring-core-7.0.8.jar 에 실재
CONTENT_TOO_LARGE             spring-web-7.0.8.jar — 런타임 확인 결과 값이 413 (PAYLOAD_TOO_LARGE 와 동일)
org.testcontainers.postgresql.PostgreSQLContainer   testcontainers-postgresql-2.0.5.jar 에 실재
```

413 확인은 추론이 아니라 실행이다.

```text
$ java … H     (HttpStatus.values() 중 value()==413 인 것)
CONTENT_TOO_LARGE -> 413
PAYLOAD_TOO_LARGE -> 413
```

## 가장 조심할 곳

`AbstractPgIntegrationTest` 는 **통합 테스트 18개 클래스의 뿌리**다. 여기가 깨지면 184건이 전부 죽는다.

## 응답 코드 문자열은 건드리지 않는다

`GlobalExceptionHandler:77` 의 `new ApiError("PAYLOAD_TOO_LARGE", …)` 는 **상수 이름이 아니라 계약**이다.

```text
docs/01_specs/api.md:79   | `PAYLOAD_TOO_LARGE` | 413 | 멀티파트 하드 한도 초과 |
```

상수만 바꾸고 문자열은 그대로 둔다.
