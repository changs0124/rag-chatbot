## 구현 완료 — 검증 통과

UI 변경이 없어 스크린샷 대신 명령 출력을 증거로 남긴다.

### 무엇이 문제였나

`RagDocumentSummary` 와 `AdminDtos.DocumentResponse` 는 필드가 **완전히 같았다**.

```java
RagDocumentSummary(UUID id, String filename, long byteSize, String status, String uploadedByName, OffsetDateTime createdAt)
DocumentResponse  (UUID id, String filename, long byteSize, String status, String uploadedByName, OffsetDateTime createdAt)
```

`toResponse()` 는 이 여섯 개를 그대로 옮겨 담기만 했다. `dto/` 로 자리만 옮겼다면 같은 모양의 타입 둘과 의미 없는 변환이 그대로 남았을 것이다.

### 무엇을 했나

| 파일 | 변경 |
|---|---|
| `mapper/RagDocumentRepository.xml` | `resultMap type` → `com.ragchatbot.dto.AdminDtos$DocumentResponse` |
| `repository/RagDocumentRepository.java` | `listAlive()` → `List<DocumentResponse>` |
| `service/AdminDocumentService.java` | `toResponse()` 삭제 + 호출부 두 곳의 `.map(...)` 제거 |
| `entity/RagDocumentSummary.java` | 삭제 |
| `docs/02_architecture/backend.md` | 레이어 절에 조회 전용 매핑 예외 명시 |

`list()` 는 이제 한 줄이다.

```java
return documentRepository.listAlive();
```

컨트롤러는 원래부터 `DocumentResponse` 를 반환하고 있어 **손댈 것이 없었다**.

### 가장 위험했던 지점 — 중첩 record 의 바이너리명

`DocumentResponse` 는 `AdminDtos` 안의 중첩 타입이라 XML 에 `$` 표기가 필요하다. MyBatis 가 이걸 해석하지 못하면 `BindingException` 이 아니라 **SqlSessionFactory 빌드 실패**로 나타나 통합 테스트가 전부 죽는다. 그래서 다른 작업보다 먼저 확인했다.

```
$ ./mvnw -o clean test -Dtest=AdminDocumentFlowTest
[INFO] Tests run: 13, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

해석된다. `type-aliases-package` 는 `com.ragchatbot.entity` 만 스캔하므로 전체 경로 표기가 맞다.

### 검증

```
$ ./mvnw clean verify
[INFO] Tests run: 164, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

**#19 와 같은 164개다** — 테스트가 줄지 않았다.

**API 계약 무변경 근거** : `AdminDocumentFlowTest` 가 응답 본문에서 필드를 직접 단언한다. 매핑 경로가 바뀌었는데도 이 단언이 그대로 통과한다는 것이 곧 계약이 안 바뀌었다는 증거다.

```java
assertThat(r.get("filename")).isEqualTo("취업규칙.pdf");
assertThat(r.get("uploadedByName")).isEqualTo("사용자");
```

```
$ grep -rn "RagDocumentSummary" backend/src/ docs/
0건
```

### 변경 규모

```
5 files changed, 14 insertions(+), 32 deletions(-)
```

순감 18줄, 타입 1개 감소.

### 남긴 결정

`repository` 가 `dto` 를 import 하는 **저장소 최초 사례**다. 대가로 SQL 이 응답 스펙에 직결되어, 이 엔드포인트의 응답 필드를 바꾸려면 XML 도 함께 고쳐야 한다. `backend.md` 「레이어」에 예외와 그 대가를 함께 적었다 — 근거를 남기지 않으면 다음 사람이 "계층 위반" 으로 읽고 되돌린다.

등록·수정·삭제는 비즈니스 규칙이 엔티티에 있으므로 **여전히 `entity` 를 경유한다.** 이 예외는 조회에만 적용된다.
