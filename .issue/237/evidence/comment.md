## 문서 동기화 완료 (커밋 `docs(237)`)

| 문서 | 전 | 후 | 근거 |
| --- | --- | --- | --- |
| `current-sprint.md` | 할 일 = #202(닫힘) | 할 일 = #235 · #105 는 영구 기록 | `gh issue list --state open` |
| `CHANGELOG.md` #228 | 「운영 반영은 따로 해야 한다」 | 2026-10-07 반영 완료(백·프론트 `262c75a` · 스토어 교체 · 그림 295장) | 10-07 운영 반영 기록 |
| `design-system.md` 7-3 | LoginPage `h-10` | `h-8 md:h-10` | `LoginPage.tsx:36` |
| `backend.md` 메모리 상한 | 「비워 두었다」 + 덧붙인 정정 | 「종전(#127)에는 비웠고 #202 에서 바꿨다」 | `docker-compose.yml` `memswap_limit: 420m` |

### 대조했지만 맞았던 것
- 케이스 수 : 백엔드 253 · 프론트 140 = `case-floors.env`
- CI 7잡 = `INDEX.md` · `CONVENTIONS.md`
- `api.md` 24개 엔드포인트 = 컨트롤러 · `erd.md` V1~V9 = Flyway · env 30개 = `.env.example`

### 검사
- `check-all.sh docs` 전부 통과
