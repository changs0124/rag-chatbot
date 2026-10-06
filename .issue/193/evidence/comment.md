## 작업 요약

관리자 문서 목록에 **「스토어와 동기화」** 를 더했습니다. 공용 스토어에 있는데 이 서버 DB 에 살아 있는 행이 없는 파일만 행으로 넣습니다(올린 사람 = 동기화한 관리자). 여러 번 눌러도 결과가 같습니다.
명세(`features.md` · `api.md` · `live-integration.md` · `erd.md`)를 먼저 고친 뒤 구현했습니다.

## 변경 전후 — 관리자 화면 (운영 상태 재현 : DB 0건 · 스토어 2건)

| 전 | 후 |
| --- | --- |
| ![문서 관리 1440 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/193/evidence/before/admin-1440.webp) | ![문서 관리 1440 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/193/evidence/after/admin-1440.webp) |

동기화를 누른 뒤 (목록 2건 + 결과 문구)

![동기화 후 1440](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/193/evidence/after/admin-synced-1440.webp)

<details><summary>모바일 390px</summary>

| 전 | 후 |
| --- | --- |
| ![문서 관리 390 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/193/evidence/before/admin-390.webp) | ![문서 관리 390 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/193/evidence/after/admin-390.webp) |

</details>

빨간 박스는 문서 목록 구역입니다. 「문서 n건」 오른쪽에 버튼이 생겼고, 결과는 목록 위에 한 줄로 뜹니다(「스토어에서 2건을 가져왔습니다」 / 「이미 스토어와 맞습니다 (스토어 n건)」).
캡처는 빌드한 화면에 같은 출처 목업 API(DB 0건 · 동기화하면 2건)를 붙여 찍었습니다. **운영에서의 확인 캡처는 머지·재배포한 뒤에 남깁니다**(완료 기준 1번).

## 정한 규칙

- **멱등** — 같은 `openai_file_id` 를 가진 살아 있는 행이 있으면 건드리지 않습니다. 동시에 실행돼도 **V9 부분 유니크 인덱스**(`openai_file_id`, 살아 있는 행만)가 중복을 막습니다
- **지운 행만 있고 스토어에는 남은 파일 → 새 행으로 다시 등록**(사용자 결정). 삭제할 때 OpenAI 정리가 조용히 실패한 파일이라 검색에는 계속 잡힙니다. 목록에 보여야 다시 지울 수 있습니다. 옛 행은 삭제 이력으로 남습니다
- OpenAI 조회(페이지 순회 · 파일명 조회)가 **하나라도 실패하면 행을 하나도 넣지 않습니다** — 일부만 들어간 채 성공처럼 보이는 상황을 막습니다
- 비관리자는 **404** — 이슈 본문은 403 이었지만 기존 규약(P-3, 관리 기능이 있다는 사실 자체를 감춤)을 따랐습니다
- 반대 방향(DB 에는 있는데 스토어에는 없는 행)은 고치지 않습니다. 그 경우는 상태 조회가 `failed` 로 드러냅니다

## 백엔드 검증

| 항목 | 전 | 후 |
| --- | ---: | ---: |
| `POST /api/admin/documents/sync` | 없음 | 있음 |
| 백엔드 테스트 (`mvnw clean test`) | 231 | **239** (실패 0) |
| 프론트 테스트 (`vitest run`) | 115 | **117** (실패 0) |

- `AdminDocumentSyncFlowTest` (TC-ADMIN-047~052, 실 PostgreSQL) — 없는 파일 등록 · 두 번 눌러도 그대로 · 지운 행 재등록 · 동기화한 문서를 지우면 스토어에서도 빠짐 · 비관리자 404 / 미인증 401 · 유니크 인덱스
- `OpenAiRealStoreFilesTest` — 페이지를 끝까지 읽음 · 행이 있는 파일은 파일명을 다시 묻지 않음 · 조회가 실패하면 던짐(일부만 돌려주지 않음)
- 프론트 TC-ADMIN-053·054 — 결과 문구와 목록 새로 읽기
- `oxlint` · `tsc -b` · `vite build` · 문서 게이트(`check-all.sh docs`) · 응답 계약 검사 통과

원본 : `.issue/193/evidence/{before,after}/backend.txt`

## 변경 파일

- `backend/.../openai/OpenAiService.java` · `OpenAiRealService.java` · `OpenAiMockService.java` — `listStoreFiles` (Real : 페이지 순회 + `/files/{id}`, Mock : 메모리 스토어)
- `backend/.../service/AdminDocumentService.java` — `sync`
- `backend/.../controller/AdminController.java` · `dto/AdminDtos.java` — 경로와 응답
- `backend/.../repository/RagDocumentRepository.java` · `mapper/RagDocumentRepository.xml` — `insertIfAbsent`(`on conflict do nothing`) · `findAliveOpenaiFileIds`
- `backend/.../db/migration/V9__rag_documents_alive_file_unique.sql`
- `frontend/src/lib/endpoints.ts` · `pages/AdminPage.tsx` — 버튼과 결과 문구
- `docs/01_specs/*` · `CHANGELOG.md` · `scripts/case-floors.env`

## 남은 일

- 머지 → 운영 재배포(V9 적용) → 운영 `/admin` 에서 동기화 후 2건 캡처
