## #585 리포트 — 이력 조각 하한(#575) 경계를 테스트로 잠갔다

**변경** — `ChatHistoryTest.fragment_floor_is_inclusive_at_the_boundary` 신규 : 최신 메시지 300자(200 토큰) 뒤 남은 예산이 **하한과 같으면** 넘친 메시지를 잘라 넣고, **하나 모자라면** 멈춘다. 예산은 상수에서 계산하고, 하한 값 200 자체도 고정(문서 「200 토큰」과 같이 바꾸게). 운영 코드 변화 없음.

**before** — 현행 테스트에 변이 2개(`>=`→`>`, 200→500) → **둘 다 16/16 통과** (`.issue/585/evidence/before/mutations-on-main.txt`)

**after** — 새 테스트에 같은 변이 → **둘 다 실패**(`fragment_floor_is_inclusive_at_the_boundary`) (`.issue/585/evidence/after/mutations-after.txt`) · 원래 코드 `./mvnw verify` 437/437 · 문서 게이트 통과

**문서** — CHANGELOG [Unreleased] Tests · 하한 436 → 437
**배포** — 불필요(테스트만)
