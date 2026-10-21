## 작업 리포트 — #391 실행되지 않는 대화별 OpenAI 정리 경로와 스키마 잔재 제거

브랜치 `chore/391-drop-unused-openai-cleanup`

### 변경
- **삭제** : `OpenAiService.deleteResources` 와 실 · 목업 구현, 목업 호출 카운터, `ConversationService` 삭제 흐름의 수집 · 호출(쓸 일이 없어진 `openAiService` 의존도 함께)
- **엔티티 · mapper** : `Conversation.vectorStoreId` · `Attachment.openaiFileId` 와 해당 컬럼 매핑
- **V10 마이그레이션** : `conversations.vector_store_id` · `attachments.openai_file_id` · `citations.uri` drop, `attachments_file_type_check` 를 `'image'` 하나로
- **살아 있는 것은 그대로** : 관리자 문서(`rag_documents`)의 같은 이름 컬럼 · `documentStatus` · `deleteDocument`
- **프론트** : 첨부 `fileType` 을 `'image'` 로, 과거 「문서」 칩 분기 삭제(첨부 = 이미지뿐이라 확대 묶음 필터도 정리)
- **테스트** : 지운 메서드 전용 `OpenAiRealDeleteResourcesTest` 2건 삭제, `ChatFlowTest` 는 목업 호출 수 대신 「삭제 뒤 메시지 조회 404」로 단언 · 백엔드 하한 321 → 319
- **문서** : `erd.md`(세 컬럼 · check · V10) · `features.md` · `frontend.md` · CHANGELOG

### 증거

| 측정 | 전 | 후 |
| --- | ---: | ---: |
| 운영 `conversations.vector_store_id` 값 있음 | 0 / 3 | 컬럼 삭제 |
| 운영 `attachments.openai_file_id` 값 있음 | 0 / 0 | 컬럼 삭제 |
| 운영 `citations.uri` | 6행 전부 빈 문자열 | 컬럼 삭제 |
| 운영 `file_type='document'` 행 | 0 | check 가 'image' 만 허용 |
| 운영 check 제약 이름 | `attachments_file_type_check` | V10 대상과 같음 |
| 백엔드 테스트 | 321 | 319(지운 메서드 전용 2건) |

- 원본 : `.issue/391/evidence/before/prod-db.txt` · `after/checks.txt`

### 검증
- `bash scripts/check-all.sh` 전부 통과(백엔드 319 · 프론트 191, Testcontainers 가 V1~V10 적용)
- **운영 반영은 백엔드 배포가 필요하다(Flyway V10 적용)** — 배포 전 DB 스냅샷 확인, 배포 뒤 채팅 · 첨부 · 대화 삭제 확인

### 남은 이슈
- 없음
