## 작업 요약
#404 의 CSP 를 운영 화면 전부에서 위반 0 으로 확인한 뒤 `Content-Security-Policy-Report-Only` → **`Content-Security-Policy`** 로 바꿨다. 정책 내용은 그대로다.

## 변경 전후
| 화면(운영) | Report-Only 위반 |
| --- | ---: |
| 대화 목록 · 문서 그림(blob 7장) | 0 |
| 첨부 이미지(API 서명 URL) · 확대 보기 | 0 |
| 첨부 업로드 · 미리보기 · 스트리밍 답변 | 화면 정상 |
| 마이페이지 | 0 |
| 관리자(문서 · 사용자) | 0 |

탐지는 `ReportingObserver`(buffered) 로 했고, 허용 밖 이미지(`example.com`)를 일부러 불러 `img-src` 위반이 잡히는 것을 확인했다(양성 대조). 원본 `before/report-only-scan.txt`.

## 검증
- 전환 뒤 운영 응답 헤더 · 같은 화면 재점검은 merge(=Vercel 운영 배포) 뒤에 한다 — 결과는 이 이슈에 덧붙인다

## 변경 파일
- `frontend/vercel.json` · `docs/02_architecture/frontend.md` · `CHANGELOG.md`

## 남은 이슈
- `report-uri` 가 없어 운영 위반은 수집되지 않는다 — 정책을 넓힐 때는 Report-Only 로 먼저 올린다(frontend.md 에 적음)
- 점검용 대화 · 첨부는 지웠다
