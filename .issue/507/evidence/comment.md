## 작업 리포트 — 어긋난 · 낡은 코드 주석과 쓰이지 않는 작은 조각 정리

브랜치 `chore/507-comment-cleanup` · 커밋 `849c0b0` · 20개 파일 · 동작 변화 없음(화면 · API 그대로라 캡처 대신 원문 · 테스트로 남김)

### 백엔드
| 위치 | 고친 내용 |
|---|---|
| `ChatService.savePartial` | 도달 불가 분기 `text.isEmpty() && "complete"` 삭제 — 호출 3곳 중 둘은 `"error"`, 남은 하나는 버퍼가 빌 때 `retractQuestion` 으로 갈라짐(#489). Javadoc 도 「받은 것 없이 끝난 중단은 오지 않음 — 호출자가 질문을 걷음」으로 |
| `Message` 머리 주석 | 타임아웃 세 갈래에 ①②③ — `ChatService` 의 「갈래 ② · ③」이 가리킬 곳이 생김 |
| `FileService:238` · `ConversationDtos:31` | 「TTL 15분」 → `FILE_ACCESS_TOKEN_TTL_MINUTES` |
| `OpenAiService` 업로드 · 삭제 Javadoc | 일시 장애 429 에 「할당량 소진 429 는 제외 #479」(`OpenAiRealService.isTransient` 의 `insufficient_quota`) |
| `FileService:48` · `OpenAiMockService:134` · `JwtService:17` | 「record 로 되돌린다」→「`AllowedType` 에 넣는다」 · 값 타입 `StoreFile` · 만료된 #328 전환기 email 클레임 문장 삭제 |

### 프론트
- 「200 전에 끊긴 턴」 6곳(`useChat.ts` 4 · `Composer.tsx` 2) → 「200 전, 또는 200 뒤 토큰 0개(#489)」
- `ChatPage.tsx` 「두 콜백은 이미 안정적」 → 토큰마다는 안 바뀌고 `selectConversation` 은 대화가 바뀔 때만 새로 만들어짐
- `MessageList.tsx` 지연 로딩 주석을 `lazy` 위로 · `RECHECK_REQUEST_TIMEOUT_MS` 의 쓰이지 않는 `export` 제거
- `useChatRace.test.ts` 「삭제가 실패하면 … 목록도 그대로다」에 **목록 단언 추가**(목록을 A 로 채우고 실패 뒤 `['A']`) · 떠 있던 JSDoc 을 대상 테스트 위로

### 백엔드 테스트
- 안 쓰는 `HttpHeaders` import 6곳 제거
- `ChatFlowTest` 분당 상한을 `@Value("${app.ratelimit.chat-per-minute}")` 로 베이스에서 읽음 · 빠진 빈 줄
- `ChatStreamExceptionHandlerTest` 케이스 번호 (025)(026) → (032)(033) · 스파이크 테스트 실패 메시지의 「M3 스파이크」→「스트리밍 전제」

### 검증
- 백엔드 `mvnw -B verify` **399/399** · 프론트 **295/295** · lint 경고 0 · build 통과 — 하한(399 · 295) 그대로
- 문서 참조 · 섹션 검사 통과, CHANGELOG [Unreleased] `### Changed`

### 증거
- before : 고치기 전 원문 [backend-targets.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/507/evidence/before/backend-targets.txt) · [frontend-test-targets.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/507/evidence/before/frontend-test-targets.txt)
- after : [diff.patch](https://github.com/changs0124/rag-chatbot/blob/main/.issue/507/evidence/after/diff.patch) · [backend.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/507/evidence/after/backend.txt) · [frontend.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/507/evidence/after/frontend.txt)
