## 작업 리포트 — #371 채팅 메시지 · 대화 제목 길이 상한

브랜치 `feat/371-input-length-caps` · 커밋 `3cbf23c`

### 결정 (사용자 확인, 10-19)
- 메시지 **4,000자**(trim 뒤 코드 포인트) 초과 → **저장 · 모델 호출 전** 400 `메시지는 4000자까지 보낼 수 있음`
- 제목 **100자** 초과 → 생성 · 변경 모두 400 `제목은 100자까지 쓸 수 있음`(잘라 저장하지 않음)
- 값은 `app.chat.max-message-chars: ${CHAT_MAX_MESSAGE_CHARS:4000}` · `app.chat.max-title-chars: ${CHAT_MAX_TITLE_CHARS:100}`. 프론트 입력창 · 제목 수정칸에도 `maxLength` 같은 값(정본은 서버)
- 실측 근거 : QA 질문 최장 211자 · 운영 사용자 메시지 최장 49자 · 제목 최장 31자 · 자동 제목은 첫 메시지 30자

### 변경
- 백엔드 : `ChatService.prepare`(빈 값 검사 바로 뒤) · `ConversationService.create/rename`(`requireTitleLength`) · `application.yml` · `.env.example`
- 프론트 : `Composer.tsx` textarea `maxLength={4000}` · `ChatPage.tsx` 제목 input `maxLength={100}`
- 문서 : `api.md`(채팅 400 사유 · 대화 생성/제목 변경 절) · `features.md` FEAT-CHAT-001 입력값 · `backend.md` 유량 제어 · CHANGELOG
- 테스트 : 백엔드 +7(`ChatFlowTest` 3 · 새 `ConversationTitleLimitTest` 4) · 프론트 +2. **하한 308 → 315 · 184 → 186**

### 증거 (백엔드 · 화면 변화 없음 — 캡처 대신 측정 · 테스트 출력)

| 항목 | 전 | 후 |
| --- | --- | --- |
| 13만 자 메시지 (운영 탐침) | **200**, 11.9초, 모델 호출까지 | 4,001자부터 400 · 사용자 메시지 행 0 (통합 테스트) |
| 2만 자 제목 (운영 탐침) | **200** 저장 | 101자부터 생성 · 변경 400, 기존 제목 유지 |
| 4,000자 메시지 · 100자 제목 | 200 | 200 (경계 통과) |
| 새 테스트 (변경 전 코드) | 상한 초과 3건 + 프론트 2건 **실패** | 전부 통과 |

- `evidence/before/prod-probe.txt`(운영 advprobe 원본 발췌) · `before/red-tests.txt` · `after/green-tests.txt` · `after/check-all.txt`
- 로컬 mock 서버 요청 증거(plan §5)는 같은 경로를 실 HTTP + 실 PostgreSQL 로 타는 통합 테스트 출력으로 대신했다

### 검증
- `./mvnw -B clean verify` 315 통과 · 프론트 lint · test 186 · build · `bash scripts/check-all.sh` exit 0(shellcheck · gitleaks · trivy 미설치 건너뜀 — CI 에서 돈다) · env 대조 누락 0

### 알아 둘 것
- 길이 검사는 `prepare` 안이라 **레이트리밋 뒤**에 돈다 — 400 으로 거절된 요청도 분당 횟수를 하나 쓴다(기존 빈 메시지 400 과 같은 동작, `backend.md` 에 적음)
- 브라우저 `maxLength` 는 UTF-16 단위라 이모지만 쓰면 화면이 서버보다 먼저 막는다(더 엄격한 쪽이 화면)
- 이미 100자를 넘는 기존 제목은 그대로 둔다(운영 최장 31자라 해당 없음)
- **운영 반영은 배포가 필요하다**(백엔드 · 프론트 모두)

### 남은 이슈
- 없음
