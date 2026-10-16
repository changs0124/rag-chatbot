## 작업 요약

아무도 읽지 않던 계약 필드 두 개를 뺐다(사용자 결정).
- **출처 `uri`** : OpenAI 레코드 → SSE `citations` → REST 응답 → 엔티티 · 매퍼 → 프론트 타입까지 모든 계층을 지나는데, 읽는 곳이 없고 값은 항상 빈 문자열이었다. 모든 계층에서 뺐다
  - DB 컬럼은 남겼다(nullable, 마이그레이션 없음). 새 행은 NULL 이고, 옛 행은 select 에서 읽지 않으므로 그대로 둔다
- **JWT `email` 클레임** : 갱신 토큰에 복사되는 것 말고는 쓰이지 않았고, 토큰마다 이메일이 들어 있었다. `issue(UUID)` 로 줄였다
  - 검증은 서명 · 만료 · subject · 비밀번호 변경 기준 시각만 본다. 그래서 email 이 든 옛 토큰도 계속 통과하고 갱신된다

## 검증

| 항목 | 전 | 후 |
| --- | ---: | ---: |
| SSE · 재조회 출처 키가 `seq` · `sourceName` · `snippet` 뿐 | 실패 | **통과** |
| 새 · 갱신 토큰에 email 없음 | 실패 | **통과** |
| email 이 든 옛 토큰 인증 · 갱신(갱신 토큰은 email 없음) | 실패 | **통과** |
| 백엔드 전체(main #327 반영 후) | 291 | **294 통과** |
| 프론트 lint · test(171) · build · `check-all.sh docs` · `quick` | — | 통과 |

- 리뷰 : APPROVE. CHANGELOG 의 「변경 전 실패 건수」를 증거대로 3건으로 고쳤다
- 원본 : `.issue/328/evidence/`

## 변경 파일

- 백엔드 : `OpenAiService` · `OpenAiRealService` · `OpenAiMockService` · `ChatService` · `ConversationDtos` · `ConversationService` · `Citation` · `ChatPersistenceService` · `CitationRepository.xml` · `JwtService` · `AuthService` · `ProfileService` · `JwtAuthenticationFilter`
- 테스트 : `ChatFlowTest` · `JwtSlidingRefreshTest` · `ChatStreamTimeoutTest` · `AuthFlowTest`
- 프론트 : `lib/types.ts` · `MessageList.test.tsx`
- 문서 : `api.md`(SSE 페이로드) · `erd.md`(`citations.uri` 행) · CHANGELOG
- `scripts/case-floors.env` : 백엔드 하한 291 → 294(실측)

## 남은 이슈

- 컬럼 삭제는 미뤘다(이번 범위 밖)
