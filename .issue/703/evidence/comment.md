## 작업 요약 — 문서 · 주석만(동작 변화 없음)

커밋 `83b677d2`. 11-11 리뷰가 짚은 낡은 서술을 고쳤다.

| 위치 | 고친 것 |
|---|---|
| `scripts/claims/preprocess.py:266` | 「S/W 버전은 상세 끝 한 줄에만 있다」 → 짧은 값이라 단독 줄로 검색에 안 걸려 표로 올림 · 클레임 값은 요약 줄에도(#699) |
| `preprocess.py:311`(#468 주석) | 「(#699 이전 판)」 표시 — 상세 S/W 줄은 이제 없다 |
| `docs/01_specs/live-integration.md:313` | 같은 서술 · 표의 지금 쓰임(버전별 건수 · 클레임 번호 질문) |
| `docs/02_architecture/frontend.md:13` | `lib/` 목록에 `conversationPrefetch.ts`(#694 · #701) |
| `frontend.md:97` | 「토큰마다」 → 토큰 반영(프레임마다, #692)마다 |
| `frontend/src/lib/conversationPrefetch.ts` | 설명 블록을 상수 → `prefetchConversations` 로 옮김(호버에 뜸) · 「쓰는 쪽은 원래 promise 로 실패를 받는다」 → 실패하면 새로 받는다(#701) · 채팅이 아닌 화면 새로고침 때 요청 하나 낭비 명시 |
| CHANGELOG `[Unreleased]` | #699 「코드 변화 없음」 → 백엔드 · 프론트 코드 · #694 「me 보다 먼저(35ms)」 → 요청 시작 목록 35 · me 44~45ms |

## 검증(캡처 대신 — 화면 · 동작 변화 없음)

- 전처리 산출물이 운영 클레임 문서(행 `f22d5e67`)와 **바이트 동일** — 주석만 바뀜
- lint · tsc · vitest 420 passed(종료 코드 0, 그대로) · docs 검사
- diff : `.issue/703/evidence/after/diff.txt`(CHANGELOG 제외) · `diffstat.txt`
