Refs #484

## 요약 — 브랜치 `fix/484-a11y-labels-focus` (커밋 411e769 · a54ef61)

### 바꾼 것

- F6 오류 `role="alert"`(조건부) · 성공 알림 `role="status"`(늘 있는 그릇) · 로그인 오류 `aria-live="assertive"` · 말풍선 오류 줄 `aria-hidden`(배너와 이중 낭독 방지)
- F7 마이페이지 이름 · 비밀번호 입력 `aria-label` · F8 사이드바 삭제 버튼 포커스 노출 + 「'제목' 대화 삭제」
- F10 대화상자 `aria-labelledby` · **확인 모달 첫 포커스 = 취소**(사용자 결정)
- design-system.md 접근성 규칙 한 항목

### 검증

- 12건 추가(role · label · dialog name · 첫 포커스). 고치기 전 12건 실패. 프론트 234/234(이 워크트리에서 `MessageListLazy` 간헐 실패 관찰 — #482 가 고치는 대상)
- 리뷰 : opus 리뷰 LOW-MED 1(status 그릇) · LOW 2 → 반영

### 증거

[before/vitest-a11y.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/484/evidence/before/vitest-a11y.txt) · [after/vitest-a11y.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/484/evidence/after/vitest-a11y.txt) · [before/grep-a11y.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/484/evidence/before/grep-a11y.txt) · [after/grep-a11y.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/484/evidence/after/grep-a11y.txt)

### 미측정 · 한계

- 실제 스크린리더 낭독은 미측정(jsdom 단언만). F9 모바일 드로어 · F11 답변 log 라이브 영역은 #105 보류

### 배포

- 프론트(Vercel 자동)

> 10-26 전체 리뷰 후속(#479~#488). 통합은 issue-merge 에서 순서대로 · 이슈는 통합 검증 뒤 닫는다.
