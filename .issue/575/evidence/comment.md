## #575 리포트 — 넘친 메시지가 직전이 아니어도 남은 예산만큼 잘라 넣는다

**변경** — `ChatService.buildHistory` : 예산을 넘친 메시지는 **남은 예산만큼 앞부분을 잘라 넣고 멈춘다.** 직전 메시지면 늘(#554 그대로), 더 오래된 메시지면 남은 예산이 `HISTORY_MIN_FRAGMENT_TOKENS`(200 토큰 ≈ 300자 — 표 머리줄 + 첫 행) 이상일 때. 중간을 건너뛰지 않고 예산 총량도 그대로다.

**before** — 새 테스트를 현행 코드에 돌리면 실패 : 이력이 `["user", "assistant"]`(긴 답 없음), 기대 `["assistant", "user", "assistant"]` (`.issue/575/evidence/before/test-on-main.txt`)

**실측**(11-04 QA H2 대화 — 13,703자 답 → 후속 1턴 뒤 세 번째 질문 · 운영 서버에서 OpenAI 직접 3회씩)

| 이력 | 결과 |
|---|---|
| 현행 규칙 — 긴 답 없음 | 3/3 「대화에 보이지 않아 모른다」 |
| 변경 규칙 — 긴 답 앞 8,898자 포함 | **3/3 정답**(QX-114 · 커넥터 · 수분 유입) |

**테스트** — `ChatHistoryTest` 신규 2(직전 아닌 메시지 잘림 · 남은 예산 부족이면 멈춤) · 기존 13 그대로 · `./mvnw verify` 435/435 · 하한 433 → 435
**문서** — `backend.md` 「대화 이력」 · `live-integration.md` 3-3 · CHANGELOG [Unreleased]
