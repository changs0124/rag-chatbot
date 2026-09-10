# Current Sprint

> 마지막 업데이트 : 2026-09-10

여기에는 **아직 안 끝난 것만** 둔다. 끝난 일의 경위는 [CHANGELOG](../06_changelog/CHANGELOG.md) 가 정본이다.
아직 착수하지 않은 항목은 [backlog.md](./backlog.md) 에 있다.

## 진행 중

- [ ] **OpenAI 실 연동 투입** — 절차와 대조 항목은 [live-integration.md](../01_specs/live-integration.md).
  **키·공용 Vector Store 확보가 선행 조건이라 아직 착수 불가**다. 코드는 `APP_MODE=live` 로 바꾸면 도는 상태이며,
  문서 등록이 제품 안(`/admin`)에 있으므로 대시보드를 거치지 않아도 된다
  - ⚠️ **두 경로를 섞지 말 것** — 대시보드로 올린 문서는 검색에는 잡히는데 관리 화면에서는 안 보인다.
    실 연동 문서 5절이 "대시보드에서 수동" → "제품 안 API" 로 뒤집힌 자리다

- [ ] **런칭** — 서버 쪽 준비는 끝났다(#127 · #129). 절차 정본은
  [backend](../02_architecture/backend.md) 「배포」. 남은 것은 저장소 밖 준비물과 실행이다 :
  - `TUNNEL_TOKEN` · `OPENAI_API_KEY` · `OPENAI_VECTOR_STORE_ID` 확보
  - `bash scripts/deploy.sh` — **통짜로 실행된 적이 없다.** `--dry-run` 을 먼저 볼 것
  - Vercel `VITE_API_BASE_URL` 설정 후 **재배포** · 백엔드 `ALLOWED_ORIGINS` 에 Vercel 도메인

## 블로커

없음. 위 항목들은 막힌 것이 아니라 **저장소 밖 준비물(API 키 · 공용 Vector Store ·
Cloudflare 터널 토큰)을 기다리는 중**이다.

**다만 GitHub Actions 는 유료 한도 소진으로 멎어 있다**(#127). 코드 변경을 밀어도 CI 가 돌지
않으므로, 그동안은 `bash scripts/check-all.sh` 로 로컬에서 확인한다. 한도가 풀리면 Actions 탭에서
`workflow_dispatch` 로 한 번 돌려 트리거·잡 조건이 의도대로 동작하는지 확인할 것 —
#129 의 변경분은 아직 실행으로 검증되지 않았다.
