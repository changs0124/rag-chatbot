## 수정 완료 — 전부 문서를 코드에 맞춤 (코드 변경 0)

오늘 작업(#19 · #21)과 무관하게 **이전부터 있던** 불일치 다섯 지점이다.

### 1 · `api.md` 201 대상

| | |
|---|---|
| 문서 | 201 = 대화 생성 · 첨부 업로드 · 문서 업로드 |
| 코드 | `@ResponseStatus` 는 **`AdminController` 한 곳뿐**. 나머지 둘은 200 |

→ 「문서 업로드. 대화 생성·첨부 업로드는 **200** 이다」

### 2 · `api.md` · `features.md` 의 502

| | |
|---|---|
| 문서 | `INTERNAL_ERROR` = **502**. 「업스트림 실패를 500으로 뭉개지 않는다」 |
| 코드 | 저장소 전체에 `502` · `BAD_GATEWAY` **0건**. OpenAI 실패는 `IllegalStateException` → `@ExceptionHandler(Exception.class)` → **500** |

**문서가 스스로 부정한 동작을 하고 있었다.** `api.md` 자기 표(`INTERNAL_ERROR | 500`)와도 모순이었다. 500 으로 맞추고, 근거를 실제로 하는 일(상관 ID 로 로그 추적)로 바꿨다.

### 3 · `features.md` 의 없는 보상 로직

| | |
|---|---|
| 문서 | 5단계 실패 → 「연결 해제를 **시도하고** 실패 시 경고 로그」 |
| 코드 | `AdminDocumentService.upload()` 는 `insert` 를 **try/catch 없이** 부른다. 보상 코드가 없다 |

여기서 **한 번 걸렀다.** 「보상 처리가 없어 고아 파일이 남는다」로 적으려다, 이 저장소에 `OrphanCleanupScheduler` 라는 고아 회수 장치가 따로 있는 것을 발견했다. 확인해 보니 그것은 `fileService.cleanupOrphans()` 로 **로컬 첨부만** 회수하고 `RagDocument`·`openai`·`vectorStore` 참조가 0건이라 이 경로를 덮지 않는다. 어느 고아인지 구분하지 않으면 오독되므로 그 사실까지 문장에 넣었다.

→ 「지금은 보상 처리가 없어 OpenAI 쪽 파일이 고아로 남는다 — `OrphanCleanupScheduler` 는 로컬 첨부만 회수하므로 이 경로를 덮지 않는다」

### 4 · `backend.md` · `CONVENTIONS.md` 의 컨트롤러 상태 코드

| | |
|---|---|
| 문서 | 「**상태 코드를 컨트롤러가 만들지 않는다** … **삭제류만** `noContent()`」 |
| 코드 | `AdminController` 가 `@ResponseStatus(CREATED)` 로 201 을 만들고, `FileController.serve()` 는 삭제류가 아닌데 `ResponseEntity<Resource>` 를 쓴다 |

원래 문장이 지키려던 것(**오류 매핑을 한곳에 모은다**)은 참이므로 살리고, 성공 상태는 컨트롤러가 정한다는 사실을 명시했다.

→ 「**오류 상태 코드를** 컨트롤러가 만들지 않는다 … **성공 상태는 컨트롤러가 정한다** — 문서 업로드가 `@ResponseStatus(CREATED)`, 삭제 3곳이 `ResponseEntity.noContent()`, 파일 서빙이 `ResponseEntity<Resource>` 로 Content-Type 을 직접 싣는다」

`CONVENTIONS.md` 사본은 `backend.md` 로 위임했다. 같은 문장이 두 곳에서 낡는 것을 막는다.

### 검증

```
$ grep -r "502" docs/                    0건
$ grep -r "연결 해제를 시도" docs/         0건
$ sh scripts/check-doc-refs.sh
참조 수집 182건 · 실재 검사 180건
문서 참조 검사 통과
```

```
4 files changed, 9 insertions(+), 8 deletions(-)
```

문서만 바뀌므로 `./mvnw` 는 돌리지 않았다.

### 절차

`#22` 에서 여섯 번 틀린 원인이 **「검증한 명제보다 강한 명제를 적은 것」** 이었다. 이번에는 순서를 바꿨다 — **쓸 문장을 먼저 코드로 확정하고**, 문장마다 대응하는 검증을 증거에 남겼다. 그 과정에서 3번의 과장을 잡았다.
