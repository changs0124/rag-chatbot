## #600 리포트 — 재서명 뒤 재만료 · 늦은 내려받기 실패 알림

**변경**
1. `useChat` : `refreshedAttachments` 를 `Set` → `Map<id, 받은 시각>`. `RESIGN_RETRY_MS`(15분 = 서버 `FILE_ACCESS_TOKEN_TTL_MINUTES` 기본값) 안에 다시 깨지면 막고(무한 요청 방지 #558 그대로), 지나서 깨지면 받은 URL 이 만료된 것이라 한 번 더 받는다
2. `ImageLightbox` : `downloadFailed` 를 `boolean` → 누른 장 번호. 결과가 늦게 와도 그 장에서만 알림이 보이고, 재서명 대상도 누른 장

**before** — 새 테스트 2개를 현행 코드에 돌리면 둘 다 실패 : TTL 이 지나도 `/fresh` 그대로 / 넘겨 간 장에 「내려받지 못했습니다」 (`.issue/600/evidence/before/tests-on-main.txt`)

**after** — 전체 331/331 · tsc · oxlint · 문서 게이트 통과 (`.issue/600/evidence/after/test-after.txt`)

**문서** — `frontend.md` 첨부 서명 URL 절 · CHANGELOG [Unreleased] Fixed · 프론트 하한 329 → 331
