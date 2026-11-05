**변경(테스트만)** — #616 의 실제 틈(giveBack 이 넘친 카드를 걷는 경로)을 그대로 재현하는 Composer 케이스. 걷힌 카드의 업로드가 다시 그리기 전에 끝나도 서버 첨부를 지우는지 본다

**before / after** — #616 의 `signal.aborted` 확인을 빼면 실패(`.issue/625/evidence/before/mutation.txt`) · 원본에서 통과

**문서** — CHANGELOG [Unreleased] Tests · case-floors FRONTEND_MIN 338 → 339

**비판 리뷰(opus)** — proceed(스케줄링 전제 주석 반영)

## 검증
- main 을 합친 뒤 vitest 339 passed

관련 이슈 #625 (통합 테스트 뒤 close)
