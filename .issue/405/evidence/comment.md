## 작업 요약
스트리밍 중 토큰마다 지난 답변과 사이드바가 다시 그려지던 것을 막았다. 화면 동작은 그대로다.
- `MessageBubble` 을 `memo` 로 — `useChat` 의 `patch` 는 진행 중인 답변만 새 객체로 만들고 나머지는 같은 객체를 돌려주므로, 지난 버블은 건너뛴다
- `Sidebar` 를 `memo` 로, `ChatPage` 가 넘기는 `onSelect` · 새 대화 핸들러를 `useCallback` 으로 고정(인라인 함수면 memo 가 매번 무너진다)

## 변경 전후 (렌더 카운트 테스트, 토큰 1개 반영)
| 지표 | 전 | 후 |
| --- | ---: | ---: |
| 마크다운 파싱(답변 2개 대화) | 2회 (지난 답변 포함) | **1회** (진행 중인 답변만) |
| 사이드바 렌더 | +1 | **+0** |
| 답변 20개 대화 · 800토큰 답변 파싱 (추정) | 약 16,800회 | **약 800회** |

마지막 줄은 위 측정에서 비례로 계산한 값이다(실기기 프로파일링은 미측정 — 렌더 카운트 테스트로 대체).

## 검증
- 변경 전 실패 : `before/red-tests.txt` — `expected [ '첫 답변', '둘째 답' ] to deeply equal [ '둘째 답' ]` · `expected 2 to be 1`
- 변경 후 통과 : `after/green-tests.txt`
- `bash scripts/check-all.sh` 통과 : `after/check-all.txt` — **백엔드 319 / 하한 319 · 프론트 193 / 하한 193** (lint · build 포함)

## 변경 파일
- `frontend/src/components/chat/MessageList.tsx` · `Sidebar.tsx` · `frontend/src/pages/ChatPage.tsx`
- 테스트 `MessageListRender.test.tsx` · `ChatPageRender.test.tsx` (신규)
- `docs/02_architecture/frontend.md` 「스트리밍 UI 규칙」 · `CHANGELOG.md` · `case-floors.env`

## 남은 이슈
- 진행 중인 답변 자체는 토큰마다 처음부터 다시 파싱한다(O(n²)) — rAF 배칭은 범위 밖
- Markdown 지연 로딩(로그인 화면 JS −38%)은 범위 밖
- #401 과 `case-floors.env` · CHANGELOG 가 겹친다 — 합칠 때 하한은 실측값으로
