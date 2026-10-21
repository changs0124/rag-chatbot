관련 이슈: [#378 두 문서 근거 답이 한 문서만 출처로 단다](https://github.com/changs0124/rag-chatbot/issues/378) (통합 확인 뒤 close)

## 변경 내용
- `OpenAiRealService.RAG_INSTRUCTIONS` 에 한 줄 + javadoc 근거 단락 — 알람 번호로 물었는데 검색 결과가 클레임 기록뿐이면 알람 이름으로 매뉴얼의 원인 · 조치도 다시 찾는다
- `docs/02_architecture/backend.md` · CHANGELOG [Unreleased]
- 이슈 본문의 원인 가설(출처 표시 누락)은 틀렸다 — 한 문서만 인용한 회차는 매뉴얼 청크가 검색에 없었다. 리포트에 정정

## 검증
- `bash scripts/check-all.sh` : 백엔드 315 / 315 · 프론트 186 / 186. 실패 1건(프론트 의존성 audit)은 무관한 vite advisory → #382
- 실측(운영 키 · 스토어로 OpenAI 직접 호출) : H1 두 문서 인용 2 → 6/6 · H3 4 → 6/6 · F1 5/6 그대로
- #376 · #377 줄과 합친 회귀(10-21) : 배터리 기대 출처 54/56(현행 52) · H1 두 문서 2/2

## 증거
[전후 리포트 보기](https://github.com/changs0124/rag-chatbot/issues/378#issuecomment-6310352458)

## merge 주의
- #382 를 먼저 merge 해야 deps-frontend 가 통과한다
- #379 · #380 · #381 과 같은 자리(`RAG_INSTRUCTIONS` · CHANGELOG 맨 위 · backend.md)를 고쳐 순차 merge 때 충돌한다 → 양쪽 보존으로 rebase
- 운영 반영은 백엔드 배포가 필요하다
