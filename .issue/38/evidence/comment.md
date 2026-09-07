## 작업 리포트

백엔드 상태 코드 이슈라 화면 변경이 없다. 캡처 대신 **테스트 전후와 게이트 출력**을 증거로 남긴다.

브랜치 `fix/38-issue-38` · 커밋 `3828553`

---

### 테스트를 먼저 써서 관찰한 것 — 새는 경로가 넷이었다

이슈에는 깨진 JSON 하나를 적었으나, 실패하는 테스트를 먼저 쓰고 돌려 보니 **넷**이 500 이었다.

```
[ERROR] Tests run: 9, Failures: 4

malformed_json_body_is_bad_request            expected: 400  but was: 500
invalid_encoding_body_is_bad_request          expected: 400  but was: 500
empty_body_is_bad_request                     expected: 400  but was: 500
path_variable_type_mismatch_is_bad_request    expected: 400  but was: 500   ← 이슈에 후보로만 적었던 것
```

마지막 것은 실물 확인 없이 후보로만 적었는데 **실제로 500 이었다.** `/api/conversations/not-a-uuid/messages` 처럼 UUID 자리에 UUID 가 아닌 값이 오면 서버 오류로 잡힌다. 없는 UUID(404)와 UUID 가 아닌 값(400)은 다른 사건이다.

넷 모두 원인이 **「클라이언트 입력을 읽을 수 없음」** 한 갈래라 한 이슈로 함께 고쳤다.

### 원인

`GlobalExceptionHandler` 에 핸들러가 없는 예외는 **요청 잘못이든 서버 잘못이든 전부** `@ExceptionHandler(Exception.class)` 폴백(`:89-96`)으로 떨어진다. `HttpMessageNotReadableException` 과 `MethodArgumentTypeMismatchException` 이 그렇게 샜다.

클래스 주석이 이렇게 단언하고 있었다.

> 스프링이 더 구체적인 핸들러를 먼저 고르므로 400·404 가 500 으로 뭉개지지 않음

**그 보장은 핸들러가 있는 예외에만 성립한다.** 이 주석이 정확했다면 애초에 의심했을 지점이라 함께 고쳤다.

### 고친 것

핸들러 8종 → 10종.

```
MethodArgumentNotValid · Conflict · Unauthorized · NotFound · BadRequest
MaxUploadSizeExceeded · RateLimit
+ HttpMessageNotReadable          → 400  (깨진 문법 · 잘못된 인코딩 · 빈 본문)
+ MethodArgumentTypeMismatch      → 400  (경로·쿼리 변수 타입 불일치)
Exception (폴백)
```

**예외 메시지는 싣지 않는다.** 파서 예외에는 본문 조각과 클래스 이름이 들어 있어 폴백과 같은 이유로 노출 대상이 아니다. TC-OPS-018 이 `HttpMessageNotReadableException` · `JsonParseException` · `com.ragchatbot` 문자열의 부재를 단언한다.

`api.md` 의 `BAD_REQUEST` 행에 「요청을 읽을 수 없음」을, `INTERNAL_ERROR` 행에 「요청이 잘못된 경우는 여기로 오지 않는다」를 더했다.

### 검증

```
$ ./mvnw -B clean test
[INFO] Tests run: 172, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS

$ bash scripts/check-case-floor.sh backend
케이스 수(backend) : 실측 172 / 하한 172
OK

$ bash scripts/check-doc-refs.sh
참조 수집 187건 · 실재 검사 185건
문서 참조 검사 통과
```

기존 **TC-OPS-013**(도메인 예외가 폴백에 걸리지 않음)이 회귀 방어의 핵심이었다 — 핸들러를 늘리면서 404·409 가 400 으로 뭉개졌다면 여기서 걸린다. 통과했다.

래칫 규칙대로 `BACKEND_MIN` 을 167 → **172**(실측값)로 올렸다.

### 완료 기준 대조

- [x] 깨진 JSON 요청이 400 `BAD_REQUEST` 로 나간다
- [x] 응답이 `{code, message}` 계약을 지킨다 — TC-OPS-014 가 `containsKeys("code","message")` 로 단언
- [x] 깨진 본문 케이스를 잠그는 테스트가 있다 — TC-OPS-014~018, 5건
- [x] `api.md` 의 400 서술과 실제 동작이 일치한다

### 범위 밖으로 둔 것

**405 · 415 도 같은 폴백으로 샌다.** `HttpRequestMethodNotSupportedException`(405) · `HttpMediaTypeNotSupportedException`(415) 은 지금도 500 이다. 이번에 다루지 않은 이유는 둘이다.

1. `api.md:86-95` 상태 코드 표에 **두 코드가 아예 없고**, 403 은 "애플리케이션은 쓰지 않는다" 고 못박혀 있다. 지금 매핑하면 계약에 없던 상태 코드가 새로 생긴다 — 명세를 먼저 정해야 한다
2. 원인이 다르다. 이쪽은 본문 파싱이 아니라 **라우팅 단계**다

별도 이슈로 다룰 값어치가 있다고 본다.
