## 작업 요약

Vector Store 계열 호출에 `OpenAI-Beta: assistants=v2` 를 싣는다. 후보 둘 중 **호출 지점에만 붙이는 쪽**을 골랐다.

**이슈가 3곳이라 적었지만 실제 호출 지점은 4곳이었다.** `deleteQuietly` 를 거쳐 나가는
`DELETE /vector_stores/{id}`(대화 전용 스토어 정리, `OpenAiRealService.java:362`)가 빠져 있었다.
넷 중 하나만 남기면 계약이 어긋난 자리가 생기므로 함께 넣었다.

## 확인 명령 결과 — 아직 못 돌렸다

완료 조건 첫 줄인 `curl -H "Authorization: Bearer $OPENAI_API_KEY" .../v1/vector_stores` 는
**실키가 없어 돌리지 못했다.** 따라서 헤더가 필수인지는 여전히 미확정이다.

이 변경은 *"필수임을 확인해서"* 가 아니라 **문서화된 계약과 어긋나 있어서** 넣은 것이다. 근거 둘:

- 공식 `openai-python` `main` — `resources/vector_stores/vector_stores.py` 12곳,
  `resources/vector_stores/files.py` 12곳 **전부** `extra_headers` 로 주입한다.
  sync·async × create · retrieve · update · list · delete · search 로, 이슈가 적은 create·retrieve 보다 넓다.
- 공식 API 레퍼런스 [`POST /v1/vector_stores`](https://developers.openai.com/api/reference/resources/vector_stores/methods/create)
  의 curl 예시에 `-H 'OpenAI-Beta: assistants=v2'` 가 있다.

## 변경 전후 — 실제로 나간 요청

키가 없어 실 API 응답은 증거가 못 된다. 대신 **우리가 무엇을 보내는지**를 로컬 서버로 받아 판정했다.
기존 `OpenAiRealDeleteResourcesTest` 와 같은 방식이다.

| 나간 요청 | 전 | 후 |
|-----------|----|----|
| `POST /vector_stores/{id}/files` | (없음) | **`assistants=v2`** |
| `GET /vector_stores/{id}/files/{fid}` | (없음) | **`assistants=v2`** |
| `DELETE /vector_stores/{id}/files/{fid}` | (없음) | **`assistants=v2`** |
| `DELETE /vector_stores/{id}` ← 이슈에 없던 4번째 | (없음) | **`assistants=v2`** |
| `POST /files` | (없음) | (없음) — 그대로 |
| `DELETE /files/{fid}` | (없음) | (없음) — 그대로 |

원본은 `.issue/37/evidence/before/beta-header.txt` · `after/beta-header.txt`.
캡처가 아니라 텍스트인 이유는 화면이 없는 변경이기 때문이다 — 판정 근거는 요청 헤더뿐이다.

## 변경 파일

- `backend/src/main/java/com/ragchatbot/openai/OpenAiRealService.java` — 상수 + 호출 4곳.
  `deleteQuietly` 는 `/files` 삭제와 공유되므로 `/vector_stores` 경로일 때만 붙인다
- `backend/src/test/java/com/ragchatbot/openai/OpenAiRealBetaHeaderTest.java` — 신규.
  **양방향으로 잠근다** : vector store 4곳에는 붙고, Files API 에는 붙지 않는다.
  기본 헤더로 올리면 두 번째 테스트가 깨진다
- `docs/01_specs/live-integration.md` — 3절 「실 응답과 대조해야 하는 가정」에 F 추가.
  미확정 상태를 표에 남겨 2-3 에서 업로드가 500 으로 끝날 때 여기부터 보게 했다

## 검증

- `./mvnw -o verify` — **186 테스트 통과, BUILD SUCCESS** (Testcontainers 실 PostgreSQL 포함)
- `scripts/check-doc-refs.sh` · `scripts/check-doc-sections.sh` 통과

## 남은 이슈 — 이 PR 로 닫히지 않는다

완료 조건 ①②는 **실키가 있어야** 한다. ③(근거 기록)만 끝났다.

- [ ] ① 확인 명령의 200/400 을 이 이슈에 기록
- [ ] ② 실제 스토어에 업로드가 201 로 성공하고 `completed` 까지 전이
- [x] ③ 어느 결론이든 근거를 남긴다 — 상수 javadoc · `live-integration.md` 가정 F

**400 이 나오면** 이 변경이 업로드를 살린 것이고, **200 이면** SDK 와 맞춘 정합성 개선으로 남는다.
어느 쪽이든 다음 사람이 같은 조사를 반복하지 않는다.
