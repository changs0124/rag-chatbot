# after — 2026-10-15, 브랜치 `feat/270-render-answer-markdown` `5f8fa31` · 같은 Chrome · 같은 대화

| 항목 | 결과 |
|---|---|
| 데스크탑 : 표 · 굵게 | 표 렌더(머리줄 음영 · 테두리 · `---:` 오른쪽 정렬 반영), 굵게 렌더 (`answer-desktop.webp`) |
| 모바일 390 : 「T 4000L 최종원인」 표 | 렌더 · 문서 scrollWidth 390 = 뷰포트 390(가로 넘침 없음), 표 폭 358 = 상자 폭 (`answer-mobile.webp`) |
| 테스트 | vitest 150/150 — 새 4건 : 서식 렌더 · 원시 HTML(`<img onerror>` · `<script>`) 미렌더 + `javascript:` 링크 제거 · 그림 표식 앞뒤 공존 · 사용자 메시지 평문 |
| lint · build | 통과 |
| 번들 | JS 293.5 → 450.9KB, **gzip 92.7 → 140.4KB(+48KB)** — react-markdown · remark-gfm(micromark · mdast) |
