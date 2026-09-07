## 결론

라우팅 단계에서 거절되는 요청 셋이 전부 500 이던 것을 실측으로 확정하고, **404 · 405 · 415 로 내리도록 고쳤다.** `backlog.md` 가 #38 이후 남겨 둔 나머지 절반이 이것으로 닫혔다.

## 추정이 사실이 됐다 — 셋 다 500 이었다

프로덕션 코드를 손대기 전에 케이스 3건을 기대값 4xx 로 넣고 돌렸다. 실패 출력이 곧 당시 동작이다.

```text
[ERROR] Tests run: 12, Failures: 3

unknown_url_is_not_found              expected: 404 NOT_FOUND            but was: 500 INTERNAL_SERVER_ERROR
unsupported_method_is_method_not_allowed  expected: 405 METHOD_NOT_ALLOWED   but was: 500 INTERNAL_SERVER_ERROR
unsupported_media_type_is_rejected    expected: 415 UNSUPPORTED_MEDIA_TYPE but was: 500 INTERNAL_SERVER_ERROR
```

**없는 URL 이 던진 예외는 `NoHandlerFoundException` 이 아니라 `NoResourceFoundException` 이었다** — Spring Boot 3.2+ 의 정적 리소스 체인이 던지는 쪽이다. 이슈 본문에 둘 중 하나로 적어 둔 것이 이것으로 확정됐다.

원인은 #38 과 같다. `ExceptionHandlerExceptionResolver`(`@ControllerAdvice` 처리)가 `DefaultHandlerExceptionResolver`(내장 MVC 예외를 4xx 로 바꿔 주는 기본 처리기)보다 **먼저** 돌아서, `@ExceptionHandler(Exception.class)` 폴백이 그 앞에서 전부 가로챈다.

## 변경 후

```text
GET  /api/nope                            → 404  {"code":"NOT_FOUND","message":"요청한 경로가 없음"}
DELETE /api/conversations                 → 405  {"code":"METHOD_NOT_ALLOWED","message":"이 경로가 받지 않는 메서드"}
                                                 Allow: POST,GET
POST /api/chat  Content-Type: text/plain  → 415  {"code":"UNSUPPORTED_MEDIA_TYPE","message":"지원하지 않는 Content-Type"}
```

셋 다 `{code, message}` 계약을 지키고 예외 메시지·클래스 이름을 싣지 않는다.

**회귀 확인** : 새 핸들러가 앞에 끼어들며 기존 400 경로를 가로챌 수 있어 함께 쟀다. `GET /api/conversations/not-a-uuid/messages` 는 그대로 400 `BAD_REQUEST` 다.

## 판단 두 가지

**`ResponseEntityExceptionHandler` 를 상속하지 않았다.** 상속하면 그쪽 기본 구현이 Spring 6 의 `ProblemDetail`(RFC 7807 — `type`·`title`·`status`·`detail`·`instance`) 본문을 만들어 **`{code, message}` 응답 계약이 그 경로에서만 깨진다.** 되살리려면 `handleExceptionInternal` 을 덮어써야 하고 기존 400 핸들러들과 우선순위도 겹친다. 파일에 이미 있는 `HttpMessageNotReadableException` 과 같은 방식으로 `@ExceptionHandler` 셋을 더했다(10종 → 13종). 폴백 주석이 지시하는 방식이기도 하다.

**405 에 `Allow` 헤더를 실었다.** RFC 9110 §15.5.6 이 MUST 로 요구한다. 헤더 없는 405 는 보낸 쪽이 무엇으로 다시 쳐야 하는지 알 수 없어 상태 코드가 반쪽이 된다. 값(`POST,GET`)은 `api.md` 「API 목록」에 이미 공개된 라우트 형태라 **P-3(403 을 쓰지 않는 존재 은닉 원칙)와 충돌하지 않는다** — P-3 가 가리는 것은 리소스의 존재이지 라우트의 모양이 아니다.

## 검증

```text
[INFO] Tests run: 184, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS

케이스 수(backend) : 실측 184 / 하한 184   OK
문서 참조 검사 통과
```

래칫 규칙대로 `BACKEND_MIN` 을 181 → **184**(실측값)로 올렸다. 신규 3건(TC-OPS-019~021).

## 완료 기준 대조

- [x] `api.md` 오류 코드 표에 `METHOD_NOT_ALLOWED`·`UNSUPPORTED_MEDIA_TYPE`, 상태 코드 표에 405·415 추가
- [x] 고치기 전 실제 동작을 테스트로 측정해 기록 — 셋 다 500 이었음을 사실로 확정
- [x] 없는 URL 이 404 `NOT_FOUND` 로 나간다
- [x] 미지원 메서드가 405 `METHOD_NOT_ALLOWED` 로 나간다
- [x] 미지원 미디어 타입이 415 `UNSUPPORTED_MEDIA_TYPE` 로 나간다
- [x] 셋 다 `{code, message}` 계약을 지키고 내부 정보를 싣지 않는다
- [x] 세 케이스를 잠그는 테스트 추가 · `BACKEND_MIN` 184 로 래칫
- [x] `backend.md` 서술과 `backlog.md` 항목 갱신 — 항목은 남은 절반이 없어 제거

## 증거

- [변경 전 측정](../blob/main/.issue/45/evidence/before/현재동작-측정.md)
- [변경 후 측정](../blob/main/.issue/45/evidence/after/변경후-측정.md)
