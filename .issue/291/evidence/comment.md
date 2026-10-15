## 작업 리포트 — #291

브랜치 `feat/291-conversation-loading-indicator` · 커밋 `7c57ffb`

### 무엇을 바꿨나

- `useChat.loadingMessages`
  - 대화를 고른 순간 켜고, 이력이 도착하면 끈다.
  - 세대 검사를 그대로 따른다. A→B 를 빠르게 누르면 A 가 먼저 와도 B 가 올 때까지 켜져 있다.
  - 실패하거나 새 대화를 누르면 바로 끈다.
- `ChatPage` : 켜져 있는 동안 본문에 스피너 + 「불러오는 중…」(`role="status"`)을 보인다. 모바일 · 데스크탑 같은 자리다.
- 테스트 6건 추가, 변이 확인 : 로딩을 켜는 줄을 빼면 2건이 실패한다. 프론트 156/156, 하한 150 → 156
- `frontend.md` · CHANGELOG

### 전후 — 대화 A 를 연 뒤, 이력 응답을 3초 늦춘 상태로 대화 B 를 누르고 0.6초 뒤

| | 전 | 후 |
| --- | --- | --- |
| 데스크탑 1440 | ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/291/evidence/before/switching-desktop.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/291/evidence/after/switching-desktop.webp) |
| 모바일 iPhone 13 | ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/291/evidence/before/switching-mobile.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/291/evidence/after/switching-mobile.webp) |

- **전** : 사이드바는 B 를 가리키는데 본문은 직전 대화 A 의 내용 그대로다. 로딩 표시가 없다.
- **후** : 본문에 로딩 표시가 나오고(빨간 박스), 직전 대화 내용과 빈 화면 안내는 숨는다.
