관련 이슈: [#38 fix(backend): 깨진 JSON 요청이 400 이 아니라 500 으로 나간다](https://github.com/changs0124/rag-chatbot/issues/38) (통합 테스트 뒤 close)

## 변경 내용

본문을 읽지 못한 요청이 500 `INTERNAL_ERROR` 로 나갔다. 보낸 쪽은 상관 ID 만 받아 무엇을 고쳐야 하는지 알 수 없었고, 단서는 서버 로그뿐이었다. `api.md:89` 가 이 경우를 400 으로 규정하고 있으므로 명세 위반이기도 하다.

**원인** — `GlobalExceptionHandler` 에 핸들러가 없는 예외는 요청 잘못이든 서버 잘못이든 전부 `@ExceptionHandler(Exception.class)` 폴백으로 떨어진다.

**테스트를 먼저 써서 관찰했더니 새는 경로가 넷이었다.**

```
malformed_json_body            expected: 400  but was: 500
invalid_encoding_body          expected: 400  but was: 500
empty_body                     expected: 400  but was: 500
path_variable_type_mismatch    expected: 400  but was: 500   ← 이슈에 후보로만 적었던 것
```

마지막 것은 실물 확인 없이 후보로만 적었는데 실제로 500 이었다. `/api/conversations/not-a-uuid/messages` 처럼 UUID 자리에 UUID 가 아닌 값이 오면 서버 오류로 잡힌다. **없는 UUID(404)와 UUID 가 아닌 값(400)은 다른 사건이다.** 넷 모두 원인이 「클라이언트 입력을 읽을 수 없음」 한 갈래라 함께 고쳤다.

핸들러 8종 → 10종. `HttpMessageNotReadableException` · `MethodArgumentTypeMismatchException` 을 400 으로 매핑한다. **예외 메시지는 싣지 않는다** — 파서 예외에는 본문 조각과 클래스 이름이 들어 있어 폴백과 같은 이유로 노출 대상이 아니다.

클래스 주석이 "스프링이 더 구체적인 핸들러를 먼저 고르므로 400·404 가 500 으로 뭉개지지 않음" 이라고 단언하고 있었으나 **그 보장은 핸들러가 있는 예외에만 성립한다.** 이 주석이 정확했다면 애초에 의심했을 지점이라 함께 고쳤다.

## 검증

```
$ ./mvnw -B clean test
[INFO] Tests run: 172, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS

$ bash scripts/check-case-floor.sh backend
케이스 수(backend) : 실측 172 / 하한 172   OK
```

기존 **TC-OPS-013**(도메인 예외가 폴백에 걸리지 않음)이 회귀 방어의 핵심이다 — 핸들러를 늘리면서 404·409 가 400 으로 뭉개졌다면 여기서 걸린다. 통과했다.

신규 케이스 5건(TC-OPS-014~018). 래칫 규칙대로 `BACKEND_MIN` 을 167 → 172(실측값)로 올렸다.

## 범위 밖으로 둔 것

**405 · 415 도 같은 폴백으로 샌다.** 이번에 다루지 않은 이유는 둘이다.

1. `api.md:86-95` 상태 코드 표에 두 코드가 아예 없고, 403 은 "애플리케이션은 쓰지 않는다" 고 못박혀 있다. 지금 매핑하면 **계약에 없던 상태 코드가 새로 생긴다** — 명세를 먼저 정해야 한다
2. 원인이 다르다. 이쪽은 본문 파싱이 아니라 라우팅 단계다

별도 이슈로 다룰 값어치가 있다.
