## 작업 리포트 — #271

**성격** : backend. 화면 변화가 없어 캡처 대신 테스트 출력과 실연동 측정을 남겼다.

### 원인
`SimpleClientHttpRequestFactory`(JDK HttpURLConnection)는 DELETE 에 출력 스트림을 열면서 기본 `Content-Type: application/x-www-form-urlencoded` 를 붙인다(본문 0바이트 · chunked).
스토어 연결 해제 API 는 이를 400 `unsupported_content_type` 으로 거절하고, `deleteQuietly` 가 삼킨 뒤 `DELETE /files` 는 성공 — **File 만 지워진 고아 연결이 검색에 계속 잡혔다.**
동기화는 그 고아의 `GET /files` 404 를 예외로 올려 전체가 500.

### 변경
- `deleteQuietly` : DELETE 에 `Content-Type: application/json` 명시, 성공 여부 반환(404 = 이미 없음 = 성공)
- `deleteDocument` : 연결 해제가 실패하면 File 을 지우지 않음(남아야 동기화로 다시 지울 수 있다)
- `listStoreFiles` : File 404 → `StoreFile.MISSING`(그 밖의 실패는 여전히 예외)
- `sync` : `missing` 은 행으로 넣지 않고 연결을 끊음 · total 에서 뺌 · 정리 건수 로그
- 테스트 TC-ADMIN-055~059 — 서버가 OpenAI 처럼 form 을 400 으로 거절한다. 기존 테스트는 경로만 봐서 못 잡았다

### 전후

| 항목 | before | after |
|---|---|---|
| 새 테스트 | 실패 3(헤더 · File 유지 · 404) | 통과 · 전체 264/264 |
| 삭제 뒤 스토어 | **남아 있음** | 없음 |
| 그 직후 동기화 | **500** | 200 |
| 고아 연결 → 동기화 | 500 | 200 · 고아 정리 |
| 지운 문서 고유 단어 질문 | — | 인용 0 · noSource 2/2 |

원본 : [before](https://github.com/changs0124/rag-chatbot/blob/16d175f/.issue/271/evidence/before/measure.md) · [after](https://github.com/changs0124/rag-chatbot/blob/16d175f/.issue/271/evidence/after/measure.md)

### 남은 것
- 운영 배포 후 운영에서 「스토어와 동기화」 1회
