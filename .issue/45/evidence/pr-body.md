관련 이슈 #45

## 무엇을 고쳤나

라우팅 단계에서 거절되는 요청 셋이 전부 500 `INTERNAL_ERROR` 로 나가던 것을 **404 · 405 · 415 로 내린다.** #38 이 본문 파싱 쪽 절반을 400 으로 잠그면서 `api.md` 에 405·415 가 없다는 이유로 남겨 둔 나머지 절반이다.

| 케이스 | 변경 전 | 변경 후 |
|--------|---------|---------|
| `GET /api/nope` | 500 `INTERNAL_ERROR` | **404 `NOT_FOUND`** |
| `DELETE /api/conversations` | 500 `INTERNAL_ERROR` | **405 `METHOD_NOT_ALLOWED`** + `Allow: POST,GET` |
| `POST /api/chat` + `text/plain` | 500 `INTERNAL_ERROR` | **415 `UNSUPPORTED_MEDIA_TYPE`** |

## 명세를 먼저 정하고 실측했다

`api.md` 상태 코드 표에 405·415 가 **아예 없었다.** 코드부터 고치면 계약에 없던 상태 코드가 조용히 생긴다. 그래서 명세를 먼저 확정하고, 케이스 3건을 기대값 4xx 로 넣어 돌려 **셋 다 실제로 500 임을 사실로 확정**한 뒤 핸들러를 붙였다.

실측에서 하나가 뒤집혔다 — **없는 URL 이 던지는 예외는 `NoHandlerFoundException` 이 아니라 `NoResourceFoundException`** 이었다. Spring Boot 3.2+ 의 정적 리소스 체인이 던지는 쪽이다. 이슈 본문에는 둘 중 하나로 적어 두었다.

## 판단 두 가지

**`ResponseEntityExceptionHandler` 를 상속하지 않았다.** 상속하면 그쪽 기본 구현이 Spring 6 의 `ProblemDetail`(RFC 7807 — `type`·`title`·`status`·`detail`·`instance`) 본문을 만들어 **`{code, message}` 응답 계약이 그 경로에서만 깨진다.** 되살리려면 `handleExceptionInternal` 을 덮어써야 하고 기존 400 핸들러들과 우선순위도 겹친다. 파일에 이미 있는 `HttpMessageNotReadableException` 과 같은 방식으로 `@ExceptionHandler` 셋을 더했다(10종 → 13종).

**405 에 `Allow` 헤더를 실었다.** RFC 9110 §15.5.6 이 MUST 로 요구한다. 헤더가 없으면 보낸 쪽은 무엇으로 다시 쳐야 하는지 알 수 없어 상태 코드가 반쪽이 된다. 값(`POST,GET`)은 `api.md` 「API 목록」에 이미 공개된 라우트 형태라 **P-3(403 을 쓰지 않는 존재 은닉 원칙)와 충돌하지 않는다** — P-3 가 가리는 것은 리소스의 존재이지 라우트의 모양이 아니다.

## 회귀 확인

새 핸들러가 앞에 끼어들며 #38 이 잠근 400 경로를 가로챌 수 있어 함께 쟀다. `GET /api/conversations/not-a-uuid/messages` 는 그대로 400 `BAD_REQUEST` 다.

## 검증

```text
[INFO] Tests run: 184, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS

케이스 수(backend) : 실측 184 / 하한 184   OK
문서 참조 검사 통과
```

신규 케이스 3건(TC-OPS-019~021). 래칫 규칙대로 `BACKEND_MIN` 을 181 → **184**(실측값)로 올렸다.

## 문서

`api.md`(오류 코드 표 · 상태 코드 표 · P-3 근거), `backend.md`(예외 매핑 표 3행 · 상속하지 않은 이유 · `Allow` 근거), `CHANGELOG.md`(`[Unreleased] Fixed`). `backlog.md` 의 해당 항목은 **남은 절반이 없어 제거**했다.

## 증거

- [변경 전 측정](../blob/main/.issue/45/evidence/before/현재동작-측정.md)
- [변경 후 측정](../blob/main/.issue/45/evidence/after/변경후-측정.md)
