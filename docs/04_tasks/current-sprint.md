# Current Sprint

> 마지막 업데이트 : 2026-09-02

여기에는 **아직 안 끝난 것만** 둔다. 끝난 일의 경위는 [CHANGELOG](../06_changelog/CHANGELOG.md) 가 정본이다.
아직 착수하지 않은 항목은 [backlog.md](./backlog.md) 에 있다.

## 진행 중

- [ ] **OpenAI 실 연동 투입** — 절차와 대조 항목은 [live-integration.md](../01_specs/live-integration.md).
  **키·공용 Vector Store 확보가 선행 조건이라 아직 착수 불가**다. 코드는 `APP_MODE=live` 로 바꾸면 도는 상태이며,
  문서 등록이 제품 안(`/admin`)에 있으므로 대시보드를 거치지 않아도 된다
  - ⚠️ **두 경로를 섞지 말 것** — 대시보드로 올린 문서는 검색에는 잡히는데 관리 화면에서는 안 보인다.
    실 연동 문서 5절이 "대시보드에서 수동" → "제품 안 API" 로 뒤집힌 자리다

## 블로커

없음. 위 항목은 막힌 것이 아니라 **저장소 밖 준비물(API 키 · 공용 Vector Store)을 기다리는 중**이다.
