Refs #481

## 요약 — 브랜치 `fix/481-lightbox-blob-download` (커밋 a1d6566 · 77d5882)

### 바꾼 것

- `ImageLightbox.download()` : src 가 `blob:` · `data:` 면 fetch 없이 앵커를 문서에 붙여 저장 후 제거(objectURL 회수 안 함). https 서명 URL 은 그대로
- 이름 없는 data: 는 MIME 에서 확장자, 그 밖은 `image.png`
- CSP 는 넓히지 않음 · frontend.md CSP 행에 「내려받기는 Report-Only 점검에서 빠져 있었고 #481 에서 찾았다」

### 검증

- ImageLightbox 9건 추가(blob · data → fetch 미호출 · 확장자 · 앵커 제거 · https → fetch). 고치기 전 2건 실패. 프론트 231/231
- 리뷰 : opus 리뷰 MED 1(과거 점검 기록 개작) · LOW 2 → 반영

### 증거

[before/csp-and-download-code.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/481/evidence/before/csp-and-download-code.txt) · [after/csp-and-download-code.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/481/evidence/after/csp-and-download-code.txt) · [before/ImageLightbox-test.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/481/evidence/before/ImageLightbox-test.txt) · [after/ImageLightbox-test.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/481/evidence/after/ImageLightbox-test.txt)

### 미측정 · 한계

- **운영 브라우저 재현 · 확인 미측정** — 근거는 CSP3 스펙(fetch 는 connect-src 대상)과 코드 경로. merge 뒤 운영에서 내려받기 확인 예정

### 배포

- 프론트(Vercel 자동)

> 10-26 전체 리뷰 후속(#479~#488). 통합은 issue-merge 에서 순서대로 · 이슈는 통합 검증 뒤 닫는다.
