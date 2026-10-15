## 작업 리포트 — 동시 채팅 상한 8 → 16 (로컬)

브랜치 `feat/278-chat-concurrency-16` · 커밋 `7655e32`

### 바꾼 것
- `app.chat.max-concurrent-streams` 기본값 16 — `application.yml` · `ChatExecutorConfig` · `ChatConcurrencyLimiter` 의 `@Value` 기본값. 풀 크기는 같은 프로퍼티라 함께 16
- 사용자당 1 · 분당 20 은 그대로
- `.env.example` · `backend.md` 「유량 제어」(근거 표) · CHANGELOG

### 측정 (로컬 live · gpt-6-sol · 서로 다른 사용자가 동시에 1회 · 단계별 1회)

| 동시 사용자 | 전(상한 8) 200 / 429 | 후(상한 16) 200 / 429 | 후 첫 토큰 p50 | 후 완료 p50 / p95 | 후 app 메모리 최고 | 후 app CPU 최고 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 8 / 0 | 8 / 0 | 6.4초 | 7.9 / 8.7초 | 233MiB | 27% |
| 12 | 8 / 4 | **12 / 0** | 5.8초 | 7.2 / 8.3초 | 209MiB | 49% |
| 16 | 8 / 8 | **16 / 0** | 5.6초 | 7.1 / 9.3초 | 216MiB | 24% |
| 17 | 8 / 9 | **16 / 1** | 6.6초 | 8.0 / 9.4초 | 221MiB | 30% |

- 전 · 후 모두 답 섞임 0 · DB 저장 불일치 0 · 스트림 오류 0
- 17번째 거절 본문 : `{"code":"RATE_LIMIT","message":"동시 요청이 많음 - 잠시 후 다시 시도"}` (기존과 같음)
- 메모리 한도 1GiB, 전(상한 8) 최고 210MiB 와 비슷. Hikari 풀 5 그대로 — 커넥션 대기 오류 0(앱 로그)
- 전후 요약 : `.issue/278/evidence/before/local_cap8_summary.json` · `after/local_cap16_summary.json` (답 원문은 저장소 밖 QA 폴더)

### 검증
- `./mvnw verify` 통과 · 케이스 수 286 / 하한 286
- 문서 게이트(doc-refs · sections · versions · merge-markers) 통과

### 남은 것
- [ ] **운영 측정** — merge · 배포 뒤 사용자가 적은 시간대에 8 · 12 · 16 · 17명(시험 계정, 끝나면 대화 · 계정 삭제)
