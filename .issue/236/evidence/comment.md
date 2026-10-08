## 주석 정리 완료 — 동작 변경 없음 (커밋 `13170f4`)

바뀐 줄 **전부가 주석**이다. `git diff -U0` 에서 주석 기호(`*` · `/**` · `//` · `#`)로 시작하지 않는 변경 줄을 세면 **0** 이다(CHANGELOG 제외).

| 계층 | 파일 | 고친 것 |
| --- | --- | --- |
| 백엔드 | `OpenAiService` · `OpenAiRealService` | 없어진 「무자료 접두」 → `noSource` 플래그 · 첨부는 이미지뿐 |
| | `OpenAiMockService` | 「APP_MODE=mock 기본」 → 기본값 없음(`AppModeGuard`) |
| | `ChatConcurrencyLimiter` (+테스트) | 해소된 미결 「레이트리밋 카운터 회수」 참조 제거 |
| | `JwtSecretPolicy` | 「HMAC 블록 256비트」 → SHA-256 출력 크기(32바이트 하한은 그대로 맞다) |
| | `ChatService` | 배열 캡처 이유(람다가 지역 변수를 못 바꿈) |
| | `AdminDocumentService` · `SecurityConfig` · `ChatDtos` | 동기화(#193) · 파일 서빙 permitAll · SSE `stage` 누락 |
| 프론트 | `api.ts` | 「두 곳」 → 세 곳(`docFigures.ts` 의 그림 로드) |
| | `TextInput` · `ImageLightbox` | 사용처 `AdminPage` · 문서 그림 확대 |
| 인프라 | `docker-compose.yml` | `.env` 「터널 토큰」 → secrets 파일(#203) · evidence 경로 |
| | `check-all.sh` · `check-shell-syntax.sh` · `deploy.sh` | 「원격 CI 가 없다」 · 없는 문서 인용 · `# 6.` 단계 머리 |
| | `Dockerfile` | 「호스트 미정」 |

### 검사
- 백엔드 `./mvnw test-compile` 통과(주석 안 `/api/files/**` 가 주석을 닫지 않는지)
- 프론트 lint · `tsc -b` · vitest 140 통과 · 셸 `bash -n` 통과 · 문서 게이트 통과

### 제외
- `ErrorBoundary.tsx` — 사용자가 커밋 안 한 변경이 있는 파일
- `OpenAiRealService` `TODO(M2)` — 실제 결함 가능성이라 주석 정리 대상이 아님
- 「그대로 둔다」 판정 목록은 [#105 코멘트](https://github.com/changs0124/rag-chatbot/issues/105#issuecomment-6049605122)
