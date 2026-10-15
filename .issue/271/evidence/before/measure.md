# before — 2026-10-15, main `c92f522` 이미지(로컬 live · 공용 스토어)

## 실연동 재현 (시험 문서 `delete-probe.md`, 내용 무해)

| 단계 | 결과 |
|---|---|
| 관리 화면 업로드 | completed · 스토어에 있음 |
| 관리 화면 삭제 | **204** |
| 삭제 5초 뒤 스토어 목록 | **여전히 있음** (`completed`) |
| `GET /files/{id}` | 404 (File 은 지워짐 → 고아 연결) |
| 「스토어와 동기화」 | **500** |
| 앱 로그 | `vector_store_file 삭제 실패 … 400 unsupported_content_type` |

- 같은 DELETE 를 `Content-Type: application/x-www-form-urlencoded` 로 직접 보내면 400 `unsupported_content_type`, `application/json` 이면 200 (#266 작업 중 실측)
- #266 에서는 이 결함 때문에 지운 원문이 계속 검색돼 전화번호가 노출됐다(`.issue/266/evidence/after/measure.md`)
- 측정 뒤 고아 연결은 바로 직접 해제했다(운영 동기화가 막히지 않게)

## 새 테스트를 고치기 전 코드에 돌린 결과

```
OpenAiRealDeleteDocumentTest  Tests run: 3, Failures: 2
  detaches_from_store_then_deletes_file  — 연결 해제가 형식 때문에 거절됨 (Content-Type: application/x-www-form-urlencoded)
  keeps_file_when_detach_fails           — 해제가 실패했는데 DELETE /files 를 보냄
OpenAiRealStoreFilesTest      Tests run: 3, Errors: 1
  file_gone_from_files_api_is_reported_as_missing — NotFound 404 가 그대로 던져짐(→ 동기화 500)
```

테스트 서버가 받은 실제 헤더 : `DELETE /vector_stores/…/files/… CT=application/x-www-form-urlencoded TE=chunked`(본문 0바이트).
JDK HttpURLConnection 이 DELETE 에 출력 스트림을 열면서 기본 Content-Type 을 붙인다. 기존 `OpenAiRealDeleteResourcesTest` 는
경로만 보고 헤더를 보지 않아, 그리고 `deleteQuietly` 가 실패를 삼켜서 이 결함을 잡지 못했다.
