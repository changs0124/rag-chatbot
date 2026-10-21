## 작업 리포트 — #392 주석 정리

브랜치 `chore/392-comment-cleanup` · 커밋 `bcd03e0`

### 변경
- `ci.yml` : 없는 「docs 잡」 → 실제 잡 이름 `static`
- `AdminRoleSynchronizer` : 「뒤의 승격이 새 계정까지 훑도록 순서를 둔다」는 틀림 → 새 계정은 바로 admin 으로 만들고, 승격은 이미 있던 user 계정만 올린다고 바로잡음
- `OpenAiMockService` 같은 뜻 두 줄 → 한 줄(REQ-RAG-004 줄은 유지) · `ChatService` 조건을 되풀이한 줄 끝 주석 삭제
- 「종전 · 예전에 · 없어졌으므로」 이력 표현을 현재 사실로(근거는 유지) : `FileService` · `JwtService` ×2 · `application.yml` · `AppModeGuard` · `deploy.sh`
- `scroll.ts` TSDoc 의 Java 식 `<p>` · `{@code}` → 마크다운 · `GlobalExceptionHandler` 홀로 닫힌 `</p>` 삭제 · `application.yml` 의 없는 `local` 프로필 언급 정정 · `check-case-floor.sh` 실행 예시를 실패 메시지와 같은 형식으로
- 하지 않은 것 : `endpoints.ts` 의 `// 프로필 (마이페이지)` — 파일이 절 라벨을 일관되게 쓰고 있어 유지. `RAG_INSTRUCTIONS` 문장은 측정이 걸린 프롬프트라 손대지 않음

### 증거

| 측정 | 결과 |
| --- | --- |
| 바뀐 파일 | 13개(+23 / −18) |
| 주석이 아닌 +/- 줄 | `ChatService` 한 줄 — 줄 끝 주석만 지움(문장 그대로) |
| 컴파일 · check-all quick | 통과 |

- 원본 : `.issue/392/evidence/after/diff-check.txt`

### 남은 이슈
- 없음
