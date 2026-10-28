## #540 전후 리포트 (주석 · 문서 서술만 · 동작 변화 없음)

구현 `acd9374` · 15파일 +21 / −18줄 · 원자료 `.issue/540/evidence/`(before 원본 15개 · after.txt 항목별 word-diff)

| 항목 | before | after | 코드 근거 |
|---|---|---|---|
| `Composer.tsx` 드롭 스크림 대비 | 12.70 · 4.95 | 12.67 · 5.23 | `design-system.md` 「토큰 밖 겹침」 실측 |
| `primaryButton.ts` · `actionButton.ts` · `BackLink.tsx` | 「주요 버튼 44px」 · 「7. 모바일」(없는 절) | 「5. 컴포넌트 규칙」 · 「7-1. 모바일」 | design-system 헤딩 |
| `.linkignore:1` | 가이드 「문서 참조 무결성」(없음) | `scripts/check-doc-refs.sh` | 실제 검사 스크립트 |
| `CONVENTIONS.md` runtime-versions | CI 설정과 대조 | CI 러너의 실제 런타임과 대조 | 스크립트 머리 주석 |
| `JwtService` 머리 주석 | subject 뿐 | subject · aud=auth · auth_time · iat · exp | `JwtService.java:83-87` |
| compose cloudflared | 리슨도 바인딩도 안 함 | 루프백 메트릭 127.0.0.1:20241 만, 1024+ 라 capability 불필요 | `deploy.sh:242` |
| `deploy.sh` 0단계 · `--dry-run` | 명령 · 원격 디렉터리만 / 기동까지 | + .env 권한 · 터널 비밀 / + 헬스 · 터널 · 정리 | `preflight` · 5~6단계 |
| `/me` 재시도 | 「최대 10회 다시」 · 「약 30초」 | 첫 시도 포함 10회 · 27초 + 요청 시간 | `AuthContext.tsx` `load(1)` · `attempt >= 10` |
| `frontend.md` SSE | `meta → …` 콜백 | `meta` 는 파싱만 · 콜백 없음 | `endpoints.ts:152` |
| `frontend.md` `src/test/` | Vitest 셋업 | + 공유 픽스처 `fixtures.ts` | 폴더 내용 |
| `backend.md` `config/` | 4종 | + 이메일 도메인 정책 · 관리자 역할 동기화 | `config/` 6파일 |
| `erd.md` snippet | 200자 | `…` 포함 최대 201자 | `SnippetPicker.java:98-99` |
| yml · `.env.example` 고아 유예 | 하한 언급 없음 | 10분 아래로 안 내려감 | `FileService.java:40, 233-235` |

### 검증
- `check-all.sh docs` 통과 · 프론트 oxlint rc=0 · `tsc -b` rc=0 · vitest **308/308**
- 백엔드 `mvnw compile` rc=0 · `deploy.sh` `bash -n` · compose / yml YAML 파싱 OK
- CHANGELOG [Unreleased] Docs
