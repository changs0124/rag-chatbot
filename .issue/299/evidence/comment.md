## 작업 리포트 — 죽은 코드 제거

브랜치 `refactor/299-remove-dead-code` · 커밋 `8f1d0cc` · 19파일 +51 / −66

### 지운 것
| 항목 | 근거 |
| --- | --- |
| `AttachmentRef.openaiFileId` | Real · Mock 어디서도 안 읽음(`storagePath` 만 씀) |
| `ChatInput.vectorStoreId` · `PreparedChat.vectorStoreId` | 항상 null(`conversations.vector_store_id` 를 갱신하는 곳 없음) → Real 은 `sharedVectorStoreId` 직접 사용 |
| #124 경고 주석 3중 | 전문은 `OpenAiService#deleteResources` 한 곳, 나머지는 참조 한 줄 |
| `mybatis.type-aliases-package` | mapper 가 전부 FQCN |
| `FileService.AllowedType.fileType` · `mediaType` | 전부 `image` / 맵 키와 같음 → 상수 `FILE_TYPE`, 서빙은 맵 키 사용 |
| 프론트 `types.ts` `timedOut` | 읽는 곳 0 |
| `Citations` 의 `!citations` 분기 | 필수 배열 |
| `frontend/public/favicon-source.png` | 참조 없이 `dist` 에 실림 → `docs/02_architecture/assets/` 로 이동(design-system 경로 갱신) |
| `deploy.sh` 옛 `TUNNEL_TOKEN` 경고 · backend.md 이주 절차 | #203 이주용, 운영 `.env` 에 해당 줄 없음(10-15 확인) |
| `.gitignore` 6항목 | 이 저장소 도구(oxlint · Maven jar · Vite SPA)가 만들지 않음 |

**유지** : `deleteResources` · `Attachment.openaiFileId`(엔티티 — 대화 삭제가 읽음) · `Conversation.vectorStoreId` · DB 컬럼(10-12 결정).

### grep (변경 범위 파일 기준, 전 → 후)
`type-aliases-package` 1 → 0 · `TUNNEL_TOKEN` 6 → 0 · `.eslintcache` 1 → 0 · `dist-ssr` 1 → 0 · `frontend/public` 의 `favicon-source.png` 있음 → 없음.
`openaiFileId` 50 → 47 · `vectorStoreId` 44 → 38 · `timedOut` 41 은 **엔티티 · DB · 백엔드 응답 필드가 유지**되므로 0 이 아니다(지운 것은 레코드 성분 · 프론트 타입뿐). 원본 : `.issue/299/evidence/{before,after}/grep.txt`

### 검증
- `./mvnw clean verify` 통과 · 케이스 수 286 / 286 (테스트 5개는 지운 생성자 인자만 빠짐, 단언 그대로)
- 프론트 oxlint · tsc · vitest 156/156 · build 통과 · 케이스 수 156 / 156
- 셸 구문 · 문서 참조 · 섹션 · 버전 게이트 통과(셸 lint 는 로컬에 shellcheck 없음 → CI 에서 확인)
- `.linkignore` 에 옛 파비콘 경로 한 줄 — CHANGELOG 옛 항목이 이동 전 경로를 적어서(`backup.sh` 와 같은 처리)
