## 결론

`asText` 9곳을 **`asString(기본값)`** 으로 옮겨 Jackson 2 의미론을 복원했다. **deprecation 13건 → 4건**, 184건 그대로 통과.

## #48 의 서술이 틀렸다

커밋 메시지에 **"`ObjectMapper`·`JsonNode` API 는 그대로"** 라고 적었는데, **시그니처에 대해서만 참이고 동작에 대해서는 거짓**이었다. 그래서 컴파일이 조용히 통과했다.

실 클래스패스로 프로브를 돌려 확인한 차이는 둘이다.

```text
OBJECT.asText()  -> THROW tools.jackson.databind.exc.JsonNodeException   (Jackson 2 는 "")
null.asText()    = []                                                    (Jackson 2 는 "null")
OBJECT.asText("D") = [D]                                                 기본값을 주면 안 던진다
```

## 가장 나쁜 곳은 `:242` 였다

```java
String type = ev.path("type").asText();   // 가드 없이 모든 SSE 이벤트마다
```

모르는 모양의 이벤트가 오면 **예전에는 `if/else` 사슬을 빠져나가 무해하게 무시**됐다. 지금은 예외가 `ChatService:216` 까지 올라가 **채팅 스트림이 통째로 죽는다**(`event: error` + DB `status="error"`).

## "터진다" 가 아니다 — 정직하게 적는다

**지금 터진다는 근거는 없다.** 여섯 줄 전부 OpenAI 가 문자열을 주는 필드이고, 문서화된 응답 모양 중 Object/Array 를 넣는 것은 없다. `:244`·`:313` 은 타입 가드 뒤에 있다.

**이것은 *실패 태도의 변화*지 알려진 트리거가 있는 버그가 아니다.** 그래도 고친 이유는 셋이다 — 비용이 거의 없고(9줄), 되돌리는 방향이 명확하며(Jackson 2 의미론), **이 경로는 테스트가 못 잡는 곳**이다.

## `:389` 는 오히려 Jackson 3 이 고친 것이었다

`{"id": null}` 이 오면 **Jackson 2 는 문자열 `"null"`** 을 줘 `isBlank()` 가드를 통과시켰고, `openai_file_id = "null"` 인 **검색에도 안 잡히고 삭제도 안 되는 행**이 생겼다.

`asString(null)` 이 같은 동작임을 실측하고(`NULL.asString(null) = null`) 옮겼다. **되돌리지 않도록 그 이유를 코드 옆에 주석으로 남겼다.**

같은 방향의 개선 2곳도 유지했다 — `:304` 는 `"null"` 을 스니펫 키로 넣던 것이, `:313` 은 `null` 이라는 이름의 출처 각주를 화면에 띄우던 것이 사라졌다.

## 검증

```text
[INFO] Tests run: 184, Failures: 0, Errors: 0, Skipped: 0   BUILD SUCCESS
deprecation : 13건 → 4건 (asText 관련 0건)
게이트 6개 전부 OK · 케이스 184/184
```

남은 4건(`PAYLOAD_TOO_LARGE` · `PathResource` · `PostgreSQLContainer` 2)은 [#64](https://github.com/changs0124/rag-chatbot/issues/64) 다. **이 이슈가 자기 몫만 가져갔다.**

## 완료 기준 대조

- [x] `asText` 9곳이 전부 `asString` 으로, **기본값 없는 호출 0건**
- [x] `asText` deprecation 경고 0건
- [x] 184건 그대로 통과
- [x] `:389` 동작 유지 — `asString(null)` 실측 후 이전
- [x] `CHANGELOG.md` 에 #48 서술 정정 포함

## 검증되지 않은 것

이 경로는 `APP_MODE=live` 전용이라 mock 테스트가 밟지 않는다. 컴파일 · 독립 프로브 · 코드 대조로만 확인됐다. **다만 변경 방향이 "예외를 던지지 않게" 이므로 틀렸더라도 Jackson 2 시절보다 나빠지지 않는다.**

## 증거

- [변경 전 실측](../blob/main/.issue/63/evidence/before/현재동작-실측.md)
- [변경 후 검증](../blob/main/.issue/63/evidence/after/변경후-검증.md)
