## 작업 리포트 — 문서 경위 서술 · 중복 정리

브랜치 `docs/297-docs-condense-dedupe` · 11파일 +133 / −335 · 대상 문서 합계 3,935 → 3713 줄

| 문서 | 전 | 후 |
| --- | ---: | ---: |
| backend.md | 694 | 633 |
| design-system.md | 449 | 417 |
| frontend.md | 280 | 236 |
| CONVENTIONS.md | 265 | 234 |
| live-integration.md | 362 | 328 |
| overview.md | 169 | 163 |
| requirements.md | 164 | 153 |
| current-sprint.md | 29 | 26 |

### 정본 지정
- 시각 규칙(라이트 단일 · 토큰 · 모션 · 답변 배경 · 사이드바 폭/로고) → `design-system.md` · 동작 계약(visualViewport · 16px 입력 · API 통신) → `frontend.md` · 코드 패턴 → `CONVENTIONS.md`
- SSE 계약 → `api.md`(backend.md 는 구현 이유, overview 는 그림 + 링크) · 환경변수 → `.env.example` · 알려진 제약 → `overview.md` · CI 잡 목록 → CONVENTIONS

### 지운 것
- 경위 서술 : 호스팅 선정 · GHCR · 스왑 실측 · 예외 핸들러 · CI run 사고 · #151~#155 재도색 · Vercel 재배포 3중 · #235 점검 · #37 · #269 표 등. **거의 전부 CHANGELOG 에 이미 있어** 옮기지 않고 지웠다(확인 후)
- 로컬 동시성 표(운영 표가 대체) · 「기동을 막는 것은 여섯」 개수 주장(세는 법에 따라 5~7) → 목록

### 일부러 남긴 것
- API-GET-003 · API-PATCH-003 「제거됨」 행(ID 안정) · 코드 주석이 참조하는 절 제목 · 「파비콘 SVG 를 따로 두지 않는다」의 근거 한 줄 · 스왑 결정의 39.1초 근거

### 검증
- 문서 게이트 4종(doc-refs · sections 31건 · versions · merge-markers) 통과
- 원본 : `.issue/297/evidence/{before,after}/lines.txt`
