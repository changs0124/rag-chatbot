관련 이슈: [#39 feat(chat): RAG 근거 부착이 모델 재량이라 인용 없는 답변이 나온다](https://github.com/changs0124/rag-chatbot/issues/39) (통합 테스트 뒤 close)

## 변경 내용


---

### 고친 것

검색 도구가 붙는 턴에 `instructions` 를 함께 보낸다. 사내 규정·절차처럼 조직마다 다른 내용은 검색 결과에 근거하고, **못 찾았으면 못 찾았다고 먼저 밝히라**는 지시다.

```java
if (storeId != null && !storeId.isBlank()) {
    body.put("tools", ...file_search...);
    body.put("include", List.of("file_search_call.results"));
    // 검색 도구가 붙을 때만 지시를 싣는다 - 스토어가 없으면 근거를 찾으라는 말이 거짓이 된다
    body.put("instructions", RAG_INSTRUCTIONS);
}
```

**강제하지 않는다.** `tool_choice` 로 file_search 를 강제하면 부착률은 오르지만 단순 인사말에도 검색이 붙어 턴당 비용과 응답 지연이 는다. 유도만 하는 쪽을 골랐다.

**지시와 도구는 같이 붙거나 같이 빠져야 한다.** 스토어가 없는데 "사내 문서를 먼저 찾아본다" 고 지시하면 모델에게 **없는 도구를 쓰라고 하는 셈**이라 답변이 어긋난다.

### 검증 — 스텁 서버가 실제로 받은 바디로 본다

`OpenAiRealDeleteResourcesTest` 가 쓰던 방식 그대로, 로컬 `HttpServer` 를 띄우고 `app.openai.base-url` 을 그쪽으로 돌려 **나간 요청 바디**를 잡았다.

```
$ ./mvnw -B test -Dtest=OpenAiRealInstructionsTest
[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0

sends_rag_instructions_when_vector_store_is_attached   스토어 있음 → instructions · file_search 둘 다 있음
omits_instructions_when_no_vector_store                스토어 없음 → 둘 다 없음
does_not_force_tool_choice                             tool_choice 를 보내지 않음
```

세 번째는 지금 아무것도 안 하는 것처럼 보이지만, **정책을 강제로 바꾸는 순간 깨진다.** 그때가 눈에 띄라고 둔 것이다.

```
$ ./mvnw -B clean verify
[INFO] Tests run: 180, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS

$ bash scripts/check-case-floor.sh backend      케이스 수(backend) : 실측 180 / 하한 180  OK
$ bash scripts/check-doc-refs.sh                참조 199건 수집 · 192건 검사 통과
$ bash scripts/check-response-contract.sh       ✓ 응답 계약 4곳 일치 (6필드)
```

### 이 테스트가 잠그지 못하는 것

**모델이 지시를 따르는지는 여기서 잴 수 없다.** 잠그는 것은 보내는 쪽뿐이다. 부착률은 실 연동에서만 측정할 수 있다.

그래서 `live-integration.md` 에 **3-2 「검색 호출 정책」** 절을 두고 한계와 재판단 기준을 적었다.

> 대가는 편차다. 지시를 넣어도 모델이 검색을 건너뛰는 턴이 남을 수 있고, 그때 화면은 「자료 없음」이 된다.
>
> **실 연동에서 부착률을 재 본 뒤 다시 판단할 자리다.** … 지시가 실제로 실려 나가는지는 `OpenAiRealInstructionsTest` 가 잠그고 있으므로, 부착률이 낮다면 원인은 보내는 쪽이 아니라 모델 쪽이다.

3-1 진단표의 「모델이 검색을 건너뜀」 행도 이 정책을 가리키도록 고쳤다.

### 완료 기준 대조

- [x] 선택한 정책과 그 이유를 문서에 남긴다 — `live-integration.md` 3-2
- [ ] 업로드한 문서에 있는 내용을 물으면 인용이 붙는다 — **실 연동 필요**
- [ ] 자료에 없는 것을 물으면 「자료 없음」이 뜬다 — **실 연동 필요**
- [ ] 스토어 미설정과 "검색했으나 근거 없음" 이 화면에서 구분된다 — **미해결.** 아래 참조

### 남긴 것

**스토어 미설정과 「검색했으나 근거 없음」이 화면에서 여전히 구분되지 않는다.** 둘 다 `noSource=true` 로 같은 배너가 뜬다. 구분하려면 서버가 「검색을 했는가」와 「근거를 찾았는가」를 나눠 내려보내야 하고, 이는 SSE 이벤트 계약 변경이라 **원인이 다른 작업**이다. 이 PR 에 섞지 않았다.

프롬프트는 상수로 두고 env 로 빼지 않았다. 정책이 하나뿐이라 값을 바꿔 가며 운영할 이유가 아직 없다. `backend.md` 「설정값은 yml 에 `${ENV:기본값}` 으로 둔다」 원칙과는 어긋나는 선택이므로 근거를 남긴다 — 필요해지면 그때 뺀다.
