## #685 3차 리뷰 후속 문서 · 주석 — 전후

동작 변화 없음(vitest 399 그대로 · 종료 코드 0 · lint 0 · docs 게이트 통과).

| 곳 | 전 | 후 |
|---|---|---|
| CHANGELOG `[2026-11-10]` 머리 문단 | 「백엔드 변화는 #676 사용자 문구 하나」 · 담은 이슈에 #635 · #640 · #638 없음 · 「새 문구 1 · 옛 문구 0」 | 「문구 둘(초기화 거절 오류 · 관리자 발급 로그)과 주석뿐」 · #635 · #640 · #638 추가 · 센 대상(새/옛 오류 문구) 명시 |
| `ProfileFlowTest.java:15` | 이름/비밀번호/테마 변경 | 이름/비밀번호 변경(테마는 #191 에서 걷힘) |
| `Sidebar.tsx:119` 주석 | 막대(accent 4.85) | 막대(`accent`/`raised` 5.46, 재계산) |
| `frontend.md` 화면 골격 | 「visualViewport 가 바뀔 때마다 … 0 으로 되돌린다」 | 루트 요소에 직접 · 같은 값 건너뜀 · 밀렸을 때만 되돌림(#668) · focusout 즉시 지움 · 방향별 키보드 높이 기억(#682) |
| `frontend.md` useChat 계약 | `conversationsFailed` 없음 | `conversationsFailed` · `retryConversations`(#675) 한 줄 |
| `ChatPage.tsx` #670 주석 | `: null}` 뒤에 떠 있음 | `: /* activeId 가 없으면 … */ null}` 분기 안으로 |

원자료 : `before/grep.txt` · `after/grep.txt`
