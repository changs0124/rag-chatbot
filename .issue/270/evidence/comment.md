## 작업 리포트 — #270

**변경** : 그림 표식 분할은 그대로 두고, 표식 사이의 답변 글만 `Markdown.tsx`(react-markdown 10.1 + remark-gfm 4.0)로 그린다.
원시 HTML 은 그리지 않고(기본) · 위험 링크 스킴 제거 · 링크는 새 탭 · 표는 가로 스크롤 상자. **사용자 메시지 · 출처 스니펫은 평문 그대로.**

| before | after |
|---|---|
| ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/270/evidence/before/answer-desktop.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/270/evidence/after/answer-desktop.webp) |

모바일 390 : ![mobile](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/270/evidence/after/answer-mobile.webp) — 문서 폭 390 = 뷰포트(가로 넘침 없음)

- vitest 150/150(새 4건 : 서식 · XSS 미실행 · 그림 공존 · 사용자 평문) · lint · build 통과 · 프론트 하한 140 → 150
- **번들 gzip 92.7 → 140.4KB(+48KB)** — 마크다운 파서 비용
- `frontend.md` 「본문은 평문」 결정을 갱신, CHANGELOG Changed
