## 작업 리포트 — #386 첨부 파일이 디스크에 없으면 500 대신 404

브랜치 `fix/386-missing-upload-404`

### 변경
- `FileService.serve` : 저장소에서 꺼낸 리소스가 실재하지 않으면 `NotFoundException("파일 없음")` — 토큰 불일치 · 남의 파일과 같은 404
- `FileFlowTest.serve_missing_file_on_disk_404` 추가(업로드 → 디스크 파일 삭제 → 서빙) · 백엔드 케이스 하한 320 → 321 · CHANGELOG

### 증거 — 재현 테스트

| 측정 | 수정 전 | 수정 후 |
| --- | ---: | ---: |
| 행 있음 · 파일 없음 → `GET /api/files/{id}` | **500** INTERNAL_SERVER_ERROR | **404** |
| 백엔드 전체 테스트 | 320 통과 + 1 실패 | 321 통과 |

- 원본 : `.issue/386/evidence/before/test.txt` · `after/test.txt`

### 검증
- `bash scripts/check-all.sh` 전부 통과(백엔드 321 · 프론트 191, #385 merge 반영 뒤)
- **운영 반영은 백엔드 배포가 필요하다** — 이번 리뷰 묶음(#389 · #391 등)과 함께 배포한다

### 남은 이슈
- 없음
