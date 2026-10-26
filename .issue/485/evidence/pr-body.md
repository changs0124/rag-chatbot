Refs #485

## 요약 — 브랜치 `fix/485-backend-low-regex-snippet` (커밋 f9456e2 · a70437c)

### 바꾼 것

- B6 `CitationMarkupFilter` 가 `SourceNameRewriter.EXTENSION` 을 씀(두 정규식은 문자열 · 플래그까지 같았음 — 동작 불변)
- B8 `SnippetPicker.truncate` : 200번째가 high surrogate 면 199자에서 자름
- erd.md 「200자」 정의 : UTF-16 코드 단위, BMP 밖 문자가 걸리면 199자, 결합 문자열(ZWJ · 국기)은 가를 수 있음

### 검증

- SnippetPickTest 경계 2건. 고치기 전 1건 실패. 관련 4클래스 42건 통과
- 리뷰 : opus 리뷰 LOW 1(erd 문구) → 반영

### 증거

[before/extension-regex.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/485/evidence/before/extension-regex.txt) · [before/snippet-test.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/485/evidence/before/snippet-test.txt) · [after/snippet-test.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/485/evidence/after/snippet-test.txt) · [after/tests-summary.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/485/evidence/after/tests-summary.txt)

### 미측정 · 한계

- DB 에 반쪽 서로게이트가 `?` 로 들어가던 것은 확인하지 않음(코드 경로로만 판단)

### 배포

- 백엔드 배포 필요

> 10-26 전체 리뷰 후속(#479~#488). 통합은 issue-merge 에서 순서대로 · 이슈는 통합 검증 뒤 닫는다.
