## 작업 리포트 — README 현행화

**증거 캡처 생략 사유** : `README.md` 한 파일의 문서 변경이라 화면·성능에 영향이 없음. 대신 변경 근거와 문서 검사 결과를 남김.

### 변경 내용과 근거

| README | 변경 | 근거 |
|---|---|---|
| 3행 | `Store(VectorDB)` → `Vector Store` | `docs/INDEX.md:3` 표기와 통일 (#220) |
| 11행 | 채팅 UI 설명에 회사 CI(디인사이트) 로고 추가 | `frontend/src/components/Logo.tsx` (#229 · #233 · #235) |
| 15 · 21행 | 툴체인 확인일 2026-10-08, "(백엔드 스캐폴딩 시)" 제거 | 백엔드 스캐폴딩 완료, `backend/pom.xml` java.version 17 |
| 핵심 요구 | 매뉴얼 그림 첨부 추가 | `docs/01_specs/requirements.md` REQ-RAG-006 (#228) |
| 핵심 요구 | 관리자 기능 추가 | REQ-ADMIN-001~004 · REQ-AUTH-006 |
| 배포 | "두 가지" → "세 가지", 서버 `doc-figures/` 추가 | `backend/.env.example:77` · `docker-compose.yml:152` |

### 검사 결과

- `scripts/check-doc-refs.sh` — 통과 (참조 261건 실재)
- `scripts/check-doc-sections.sh` — 통과 (섹션 참조 27건)
- `scripts/check-doc-versions.sh` — 통과 (버전 주장 28건)
