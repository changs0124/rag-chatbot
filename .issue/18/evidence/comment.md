## 구현 완료 — 검증 통과

동작 변경 0 의 순수 리네이밍. UI 가 없는 변경이라 스크린샷 대신 **명령 출력**을 증거로 남긴다.

### 변경 결과

| 이전 | 이후 | 비고 |
|---|---|---|
| `web/` | `controller/` | |
| `web/dto/` | `dto/` | 최상위. `*Dtos` 홀더 클래스 유지 |
| `mapper/` | `repository/` | 인터페이스 6개 클래스명도 `*Repository` |
| `mapper/handler/` | `repository/handler/` | |
| `domain/` | `entity/` | |
| `error/` | `exception/` | |

`config/` · `service/` · `security/` · `storage/` · `openai/` 는 그대로 두었다.

### MyBatis 연결 고리 — 컴파일러가 못 잡는 세 곳

인터페이스 FQCN 과 1:1 대조했고 전부 일치한다.

```
namespace ↔ 인터페이스
  OK  AttachmentRepository.xml   -> com.ragchatbot.repository.AttachmentRepository
  OK  CitationRepository.xml     -> com.ragchatbot.repository.CitationRepository
  OK  ConversationRepository.xml -> com.ragchatbot.repository.ConversationRepository
  OK  MessageRepository.xml      -> com.ragchatbot.repository.MessageRepository
  OK  RagDocumentRepository.xml  -> com.ragchatbot.repository.RagDocumentRepository
  OK  UserRepository.xml         -> com.ragchatbot.repository.UserRepository

resultMap / parameterType type
  OK  com.ragchatbot.entity.{Attachment,Citation,Conversation,Message,
                             RagDocument,RagDocumentSummary,User}

application.yml
  type-handlers-package: com.ragchatbot.repository.handler
  type-aliases-package:  com.ragchatbot.entity
```

`mapper-locations: classpath:mapper/*.xml` 가 가리키는 `resources/mapper/` **폴더명은 표준 구조상 유지**하고 파일명만 `*Repository.xml` 로 맞췄다.

### 검증

```
$ ./mvnw clean verify
[INFO] Tests run: 164, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

Testcontainers 로 실 PostgreSQL 을 띄우는 통합 테스트가 포함되어 있어, 런타임에만 드러나는 `BindingException` 경로까지 실제로 지났다.

```
$ grep -rn "com.ragchatbot.\(domain\|mapper\|web\|error\)" backend/src/
0건
```

`ObjectMapper`(Jackson) 는 접두사가 달라 치환 대상에서 벗어났음을 확인했다.

### diff 형태

```
71 files changed, 295 insertions(+), 295 deletions(-)
```

**완전 대칭**이다. 모든 변경 줄이 1:1 치환이고 순증이 0 이라, 리네이밍 외의 내용이 섞이지 않았음을 형태로 확인할 수 있다. 71개 중 49개는 내용 변경이 아예 없는 순수 rename 이다.

### 이슈 본문에 없던 추가분 — 문서 동기화

`docs/` 가 패키지 표의 **정본**을 들고 있어 코드만 바꾸면 조용히 거짓이 된다. 같은 커밋에 넣었다.

| 파일 | 고친 것 |
|---|---|
| `docs/02_architecture/backend.md` 「레이어」 | 패키지 표 정본 — 4개 레이어명 |
| `docs/01_specs/api.md` | "컨트롤러 정본은 `.../ragchatbot/web/`" 경로 |
| `docs/CONVENTIONS.md` 네이밍 | 매퍼 `XxxMapper` → 리포지터리 `XxxRepository` |

### 남은 것 (범위 밖)

- Spring Boot **3.5.16** 은 OSS 무상 지원이 끝난 마지막 릴리스다(2026-06-30 종료). 4.x 업그레이드는 별도 이슈가 필요하다
- `entity/RagDocumentSummary` 는 `RagDocumentRepository.xml` 의 `summaryResult` 전용 조회 타입이라, 엔티티가 아니라 조회 전용 투영으로 재분류할 여지가 있다. 이번엔 `entity/` 로 이동만 했다
