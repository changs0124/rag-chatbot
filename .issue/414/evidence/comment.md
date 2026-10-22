## 작업 요약
- 답변 속 마크다운 링크(`a`)를 `<a>` 없이 `글자 (호스트)` 로 그린다. 이미지(#359)와 같은 방식이다. 호스트는 `new URL(href).host`, http/https 만. 상대 경로 · `javascript:` · `mailto:` · 깨진 값은 글자만 남긴다.
- 출처 목록 · 그림 등 앱이 만든 링크는 이 경로를 거치지 않아 그대로다.

## 변경 전후
- 전 : `[x](https://evil.example/?q=1)` → 눌리는 `<a href>` (한 번 클릭으로 대화 요약이 쿼리로 나감)
- 후 : 같은 입력 → `x (evil.example)` 글자, `<a>` 없음
- 변경 전 실패 : `evidence/before/red-tests.txt` (3건 실패) · 변경 후 : `evidence/after/green-tests.txt`

## 검증
- `npm run lint` · `npm test`(25 파일, 197건 통과) · `npm run build` 통과
- 프론트 합계 195 → 197, `FRONTEND_MIN=197`
- 링크가 눌린다고 단정하던 기존 2건(javascript: 스킴 지움 · 이미지 감싼 링크)은 `<a>` 없음 + 글자 단정으로 조정

## 변경 파일
- `frontend/src/components/chat/Markdown.tsx` · `frontend/src/components/chat/MessageList.test.tsx`
- `docs/02_architecture/frontend.md` · `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env`

## 남은 이슈
- 없음. 호스트는 `url.host`(포트 포함)로 표시한다.
