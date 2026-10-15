# after — 2026-10-15, 브랜치 `fix/271-delete-detaches-store-file` `ed3030d` 이미지(로컬 live · 공용 스토어)

## 테스트

- 새 테스트 5건(TC-ADMIN-055~059) 포함 `./mvnw verify` : **Tests run: 264, Failures: 0, Errors: 0** · BUILD SUCCESS
- `OpenAiRealDeleteDocumentTest` 3/3 · `OpenAiRealStoreFilesTest` 3/3(404 → missing, 500 은 여전히 예외) · `AdminDocumentSyncFlowTest` 고아 정리
- 문서 게이트 5종(doc-refs · doc-sections · doc-versions · merge-markers · response-contract) · 케이스 하한 264/264 OK

## 실연동

| 시나리오 | before | after |
|---|---|---|
| 업로드 → 관리 화면 삭제 → 5초 뒤 스토어 | **남아 있음** | **없음** |
| 그 직후 동기화 | **500** | 200 |
| File 만 지운 고아 연결 → 동기화 | (500) | **200** `{"added":0,"total":2}` · 고아 연결 사라짐 · 로그 「파일이 없는 스토어 연결 1건을 정리함」 |
| 지운 시험 문서의 고유 단어로 질문(2회) | — | 인용 0 · `noSource:true` 2/2 |

스토어는 시험 뒤 원래 2개(매뉴얼 · 마스킹판 클레임)로 돌아왔다.

## 남은 것
- 운영 배포 후 운영에서 동기화 1회(옛 백엔드 시절 삭제로 생긴 고아가 있으면 정리됨)
