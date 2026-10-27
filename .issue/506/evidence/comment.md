## 작업 리포트 — 문서 · 주석 9곳을 코드에 맞춤

브랜치 `docs/506-docs-code-sync` · 커밋 `635e710` · 문서 · 주석만(실행 코드 · 스크립트 동작 변화 없음)

| 문서 | 고친 내용 | 근거(코드) |
|---|---|---|
| `backend.md:24` | DTO 직접 매핑 `listAlive()` 한 건 → `listAlive()` · `findSummaryById()` 두 건(같은 `summaryResult`) | `RagDocumentRepository.xml` 53 · 61 |
| `backend.md:31-33` | `<update>` 9 · `<delete>` 2 · 11건 → 10 · 3 · 13건 | mapper XML 실측 insert 7 · update 10 · delete 3 |
| `check-response-contract.sh:4-6` (주석) | 같은 두 건 · 「그 resultMap 한 곳」 | 위와 같음, 게이트 결과 그대로 「4곳 일치 (6필드)」 |
| `features.md:369` | 「목록에서 다시 찾아」 → id 로 다시 읽음(`findSummaryById`) | `AdminDocumentService.java:189` |
| `features.md:539-540` | 「토글이 사라지고 · 들어간다」(경위) → 현재 상태 | `LoginPage.tsx:88` |
| `frontend.md:26` | `/admin` 보호 「`ProtectedRoute` + 관리자만」 → 라우트 가드는 `ProtectedRoute` 뿐, 관리자 아니면 `AdminPage` 가 `/` 로(접근 제어는 서버 404) | `App.tsx:28-36` |
| `frontend.md:145-147` | 「남은 한계」에서 #489 로 해결된 부분을 빼고 남은 것(8초 넘게 이벤트 없음)만 | — |
| `backend/.env.example:25-26` · `docker-compose.yml:138` (주석) | DB 비밀번호 출처를 #415 이후로 — 앱 `APP_DB_*` · 마이그레이션 `POSTGRES_PASSWORD` | `docker-compose.yml:144-147` |
| `backend/.env.example:80-82` (주석) | `FILE_STORAGE_ROOT` 는 compose 가 `/data/uploads` 로 덮어씀 | `docker-compose.yml:148` |
| `check-doc-sections.sh:99` (주석) | 「참조 둘인 줄은 없다」 → 있다(INDEX · README · requirements), 둘째는 검사 안 됨 | — |

CHANGELOG [Unreleased] 에 `### Docs` 항목.

### 증거
- before : 고치기 전 해당 구간 원문 — [before/targets.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/506/evidence/before/targets.txt)
- after : 전체 diff [after/diff.patch](https://github.com/changs0124/rag-chatbot/blob/main/.issue/506/evidence/after/diff.patch) · 검사 결과 [after/checks.txt](https://github.com/changs0124/rag-chatbot/blob/main/.issue/506/evidence/after/checks.txt) — 문서 참조 · 섹션 이름 · 응답 계약(4곳 일치) 통과, 고친 두 셸 `bash -n` 통과
