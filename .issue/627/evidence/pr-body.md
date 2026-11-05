**변경(테스트만)** — 동기화 유예 테스트(TC-ADMIN-049 · 094)가 `deleted_at` 을 SQL `now()` 대신 JVM 시각으로 넣는다. 운영 코드와 같은 시계를 써 컨테이너 VM 시계가 어긋날 때의 거짓 실패를 없앤다. 049 여유 1분 → 1시간 전

**before / after** — 유예 확인을 뺀 변이에서 094 가 실패(`.issue/627/evidence/before/mutation.txt`) · 원본 8/8 통과

**문서** — CHANGELOG [Unreleased] Tests (케이스 수 변화 없음)

**비판 리뷰(opus)** — proceed

관련 이슈 #627 (통합 테스트 뒤 close)
