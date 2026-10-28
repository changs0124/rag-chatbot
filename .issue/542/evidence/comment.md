## #542 전후 리포트 — 매퍼 `<sql>` 묶기 · 첨부 용량 메시지

구현 커밋 `03ed169` (브랜치 `fix/542-mapper-sql-include`)

### 바꾼 것
| 매퍼 | `<sql>` | 대체한 곳 |
|---|---|---|
| `UserRepository.xml` | `userColumns` | findById · findByEmail · listAll |
| `ConversationRepository.xml` | `conversationColumns` | findByIdAndUser · lockSharedByIdAndUser · listByUser |
| `AttachmentRepository.xml` | `attachmentColumns` | findByIdAndUser · findOrphans (`findByConversation` 은 `a.` 별칭이라 그대로 — 묶으려면 `<property>` 치환을 모든 호출에 넘겨야 해 오히려 늘어난다) |
| `RagDocumentRepository.xml` | `documentColumns` · `insertDocument` · `selectSummary` | findInProgress · findAliveById / insert · insertIfAbsent / listAlive · findSummaryById |

- 「컬럼은 findAliveById 와 같다」 주석은 `<include>` 가 대신하므로 지웠고, 조인 이유 주석은 `selectSummary` 정의 위로 옮겼다
- `FileService` 「용량 초과(image 최대 10MB)」 → 「용량 초과(최대 10MB)」(문서 업로드 메시지와 같은 꼴) · `FileServiceSizeCheckTest` 함께. `FILE_TYPE` 상수는 `file_type` 저장 · 응답에 그대로 쓰인다(범위 밖)
- CHANGELOG [Unreleased] `### Refactored`

### 증거 — SQL 동작 그대로
화면이 없는 변경이라 캡처 대신 **`<include>` 를 펼친 SQL 대조**로 남긴다. [`sqldump.py`](https://github.com/changs0124/rag-chatbot/blob/main/.issue/542/evidence/sqldump.py) 가 매퍼마다 `<include refid>` 를 `<sql>` 본문으로 펼치고 동적 태그(`<if>` · `<foreach>`)는 표지로 남긴 뒤 공백을 정규화해 문장마다 한 줄로 쓴다.

| | before | after |
|---|---|---|
| 펼친 SQL | [sql-expanded.tsv](https://github.com/changs0124/rag-chatbot/blob/main/.issue/542/evidence/before/sql-expanded.tsv) | [sql-expanded.tsv](https://github.com/changs0124/rag-chatbot/blob/main/.issue/542/evidence/after/sql-expanded.tsv) |
| 문장 수 | 43 | 43 |
| sha256 앞 16자 | `c48985d942b88b09` | `c48985d942b88b09` |
| `./mvnw verify` | [rc=0 · 424/424](https://github.com/changs0124/rag-chatbot/blob/main/.issue/542/evidence/before/verify.txt) | [rc=0 · 424/424](https://github.com/changs0124/rag-chatbot/blob/main/.issue/542/evidence/after/verify.txt) |

`diff` 결과 차이 없음. 테스트 수는 그대로다(Testcontainers Postgres 통합 테스트 포함). `scripts/check-all.sh docs` 도 통과했다.
