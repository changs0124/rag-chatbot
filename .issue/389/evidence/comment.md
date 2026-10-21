## 작업 리포트 — #389 백엔드 중복 정리 · 스니펫 선택 분리

브랜치 `refactor/389-backend-dedupe-snippet-picker`

### 변경
- `MeResponse` 생성 두 곳(`AuthService` · `ProfileService`) → 하나로
- 대화 소유 확인 : `ChatService` 가 `ConversationService.requireOwned` 를 쓴다(`ChatService` → `ConversationService` 의존, 순환 없음)
- `ConversationService` 안 `ConversationResponse` 매핑 두 곳 → private 헬퍼
- `ADMIN_EMAILS` 파싱 세 곳 → `EmailDomainPolicy`(`adminEmails()` · `isAdminEmail`) 한 곳. `AdminUserService` · `AdminRoleSynchronizer` 의 별도 `@Value` 삭제, 정규화(trim · 소문자) 그대로
- 이미지 확장자↔미디어 타입 표 두 곳 → `FileService` 한 곳. `AttachmentRef` 가 미디어 타입을 싣고 `OpenAiRealService.mimeFromPath` 삭제
- 스니펫 선택 정적 로직(약 80줄)을 package-private `SnippetPicker` 로(`CitationMarkupFilter` 와 같은 방식, 근거 javadoc 함께 이동). `backend.md` 의 이름 갱신
- 순서 집합으로만 쓰던 `Map<String,Boolean>` → `LinkedHashSet` · `java.util.Locale.ROOT` → import

### 증거 — 동작 불변 확인(리팩터라 화면 · 응답 변화 없음)

| 측정 | 전 | 후 |
| --- | ---: | ---: |
| 백엔드 테스트 | 319 통과 | **319 통과** |
| 프론트 테스트 | 191 | 191 |

- 미디어 타입 대체값 차이 : 지운 `mimeFromPath` 는 모르는 확장자를 `image/jpeg` 로, 새 조회는 `application/octet-stream` 으로 둔다. 저장 경로의 확장자가 같은 표에서 나오므로 실제로 생길 수 없는 경우다
- 원본 : `.issue/389/evidence/after/checks.txt`

### 검증
- `bash scripts/check-all.sh` 전부 통과(main 합친 뒤 · #392 와 겹친 `AdminRoleSynchronizer` 는 #389 코드 + #392 주석으로 해소)
- 운영 반영은 백엔드 배포가 필요하다(동작 변화 없음)

### 남은 이슈
- 없음
