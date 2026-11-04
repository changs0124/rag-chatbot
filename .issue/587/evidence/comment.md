## #587 리포트 — 첨부 재서명(#558) 빈틈 3건

**변경**
1. `useChat.refreshAttachment` : 시도 표시(`refreshedAttachments`)를 요청 **전**이 아니라 **새 URL 을 받아 바꿨을 때만** 남긴다 — 요청 실패 · 서버 이력에 아직 그 첨부가 없으면 다음에 깨질 때 다시 시도
2. 같은 대화의 진행 중 요청(`resigning`)을 공유 — 여러 장이 한꺼번에 깨져도 `GET /messages` 한 번
3. `ImageLightbox` 에 `onImageError(index)` : 확대 화면 `<img onError>` 와 내려받기 실패(`!res.ok`)가 부른다. `MessageList` 가 그 장의 첨부 id 로 같은 재서명에 잇는다. 내려받기 실패는 `role="alert"` 「내려받지 못했습니다. 잠시 뒤 다시 눌러 주세요」(사용자 결정 11-04)

**before** — 새 테스트 5개를 현행 코드에 돌리면 전부 실패 : 실패 뒤 다시 시도 안 함(`/old` 그대로) · 2장에 이력 2번(3회 호출) · 내려받기 실패 알림 없음 · 확대 화면 오류를 알리지 않음(2건) (`.issue/587/evidence/before/tests-on-main.txt`)

**after** — 5개 통과 · 전체 327/327 · tsc · oxlint · 문서 게이트 통과 (`.issue/587/evidence/after/test-after.txt`)

**문서** — `frontend.md` 첨부 서명 URL 절 · CHANGELOG [Unreleased] Fixed · 프론트 하한 322 → 327
**배포** — 프론트라 merge 때 Vercel 이 반영
