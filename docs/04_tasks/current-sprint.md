# Current Sprint

> 마지막 업데이트 : 2026-09-12

여기에는 **아직 안 끝난 것만** 둔다. 끝난 일의 경위는 [CHANGELOG](../06_changelog/CHANGELOG.md) 가 정본이다.
아직 착수하지 않은 항목은 [backlog.md](./backlog.md) 에 있다.

## 진행 중

- [ ] **OpenAI 실 연동 투입** — 절차와 대조 항목은 [live-integration.md](../01_specs/live-integration.md).
  **키·공용 Vector Store 확보가 선행 조건이라 아직 착수 불가**다. 코드는 `APP_MODE=live` 로 바꾸면 도는 상태이며,
  문서 등록이 제품 안(`/admin`)에 있으므로 대시보드를 거치지 않아도 된다
  - ⚠️ **두 경로를 섞지 말 것** — 대시보드로 올린 문서는 검색에는 잡히는데 관리 화면에서는 안 보인다.
    실 연동 문서 5절이 "대시보드에서 수동" → "제품 안 API" 로 뒤집힌 자리다

- [ ] **런칭** — **여기가 런칭의 정본이다**(#174). `backlog.md` 는 이 항목을 가리키기만 한다.
  절차 정본은 [backend](../02_architecture/backend.md) 「배포」이고, 아래는 **남은 준비물과 순서**다.

  **VM 은 이미 만들어져 있고 지금 꺼져 있다.** 「처음부터 만들어야 하나」와 「켜기만 하면 되나」는
  착수 비용이 다르므로 적어 둔다 — GCP `e2-micro` 구축 완료(#127 · #129), 인스턴스 `free-vm`
  (`us-west1-b`)이 현재 `TERMINATED`. 재개는 **켜고 `bash scripts/deploy.sh`** 다.

  저장소 밖 준비물 :
  - `TUNNEL_TOKEN`(Cloudflare 터널 생성) · `OPENAI_API_KEY` · `OPENAI_VECTOR_STORE_ID` 확보
  - `bash scripts/deploy.sh` 로 실배포 — **이 스크립트는 통짜로 실행된 적이 없다.** `--dry-run` 을 먼저 볼 것
  - Vercel 프로젝트에 `VITE_API_BASE_URL`(터널 도메인) 설정 후 **재배포**.
    현재 프로덕션 번들에 `http://localhost:8080` 이 박혀 있다(배포된 `/assets/index-*.js` 에서 확인)
  - 백엔드 `ALLOWED_ORIGINS` 에 Vercel 도메인 — 빠뜨리면 CORS 로 전 API 차단

  **이 런칭을 기다리는 열린 이슈가 셋이다.** 배포하는 날 이슈를 각각 열어 보지 않아도 되게 적어 둔다.

  | 이슈 | 무엇이 남았나 | 왜 지금 못 하나 |
  |------|---------------|-----------------|
  | #37 | `curl` **한 줄**로 Vector Store 호출에 `OpenAI-Beta` 헤더가 필수인지 판정 | 실 `OPENAI_API_KEY` 가 필요하다. 코드는 이미 헤더를 보내고 테스트로 범위가 잠겨 있다 |
  | #130 | 완료 조건 1번 「VM 을 켜고 한 항목씩 적용해 기동 확인」 마무리 | VM 이 꺼져 있다. 로컬에서 같은 compose 로 확인했으나 **커널이 다르다.** `cloudflared` 는 토큰이 자리표시자라 정상 동작 미확인 |
  | #132 | DB·첨부 백업 자동화 전체 | 이슈 본문이 **「배포 완료 후 착수할 것」** 이라고 스스로 지정했다. 지금은 `APP_MODE=mock` 이라 잃을 데이터가 없다 |

  **키가 들어오면 이 순서로 한다** — #37 을 먼저 두는 것은 2초면 끝나고 결과가 배포 판단에 쓰이기 때문이다 :

  ```text
  1) #37 의 curl 한 줄  (2초. 400 이면 헤더가 필수였다는 확인, 200 이면 SDK 정합성 개선으로 남는다)
  2) free-vm 시작 후 bash scripts/deploy.sh --dry-run -> 실배포
  3) #130 의 하드닝을 VM 에서 한 항목씩 재확인 (+ 토큰 넣은 cloudflared 가 실제로 붙는지)
  4) #132 착수 — 데이터가 쌓이기 시작한 뒤에 의미가 있다
  ```

## 블로커

없음. 위 항목들은 막힌 것이 아니라 **저장소 밖 준비물(API 키 · 공용 Vector Store ·
Cloudflare 터널 토큰)을 기다리는 중**이다. 그 준비물 하나가 이슈 **셋**(#37 · #130 · #132)을
동시에 막고 있다 — 목록과 순서는 위 「런칭」 항목에 있다.

**GitHub Actions 한도 문제는 해소됐다**(2026-09-11 공개 전환). 공개 저장소는 standard runner
분이 무료다. PR #134 에서 7잡 중 코드 4잡이 정상 완주하는 것을 확인했고, #135 로 `secrets`·`deps`
3잡도 변경마다 돌도록 되돌렸다. 로컬 예행(`bash scripts/check-all.sh`)은 **왕복 시간을 아끼는
용도로** 그대로 유용하다.
