## 작업 리포트 — #387 코드와 어긋난 문서 · 중복 사실 정리

브랜치 `docs/387-doc-sync-dedupe`

### 변경 — 코드와 어긋남
- **운영 되돌리기 안내(`live-integration.md` §6)** : 「`APP_MODE=mock` 으로 되돌린다」를 운영에서 따르면 prod 프로필 + mock 가드(#305, `AppModeGuard`)로 백엔드가 기동하지 않았다 → 운영은 이전 이미지(`prev-<sha>`)로 되돌리고, mock 은 로컬 전용(`SPRING_PROFILES_ACTIVE=` 로 가드를 끄는 것은 운영용이 아님)
- `overview.md` 채팅 시퀀스 stage 에 `reviewing`(#375, 검색 결과가 왔을 때만)
- 동기화 응답 `total` 설명(`features.md` · `AdminDtos` javadoc) = 스토어 파일 수 − 이번에 정리한 끊긴 연결(`AdminDocumentService` 와 일치, api.md 는 원래 맞음)
- `backend.md` mapper 쓰기 경로 개수 `<delete>` 3 → 2 · 수정·삭제 12 → 11(실측 insert 7 · update 9 · delete 2)
- `backend.md` 「운영 VM 에서도 같은 값 확인」 = 10-06 GCP VM 기준임을 밝힘(현재 Lightsail, #243)
- 파일 토큰 「TTL 15분」 → 「기본 15분(`FILE_ACCESS_TOKEN_TTL_MINUTES`)」(api · backend · features)
- `backend.md` 머리말 범위 설명을 실제 절 목록에 맞춤 · 정의 없던 「두 제품」 → ChatGPT · Claude(features · design-system)
- 문서 머리 날짜 · 버전 갱신(features 2.5 · api 1.5 · live-integration 1.8 · erd 1.4 · design-system 2.7 · requirements 1.5)

### 변경 — 중복(한 곳만 남기고 링크)
- README 의 CI 7잡 표 → CONVENTIONS 「테스트·CI 게이트」 링크 한 줄(`.issue/**` 만 바꾼 push 는 CI 를 건너뛰고 주간 스케줄은 보안 3잡만 돈다는 점도)
- 레이트 리밋 · 동시 상한 숫자 → `backend/.env.example` 정본, README · backend.md 는 무엇을 막는지와 env 이름만
- `rag_documents` 소프트 삭제 이유 → `erd.md` 한 곳, features 는 링크
- `overview.md` 시스템 다이어그램에 Vercel · Cloudflare Tunnel 경로

### 증거

| 측정 | 결과 |
| --- | --- |
| 바뀐 파일 | 11개(+57 / −56), 코드는 `AdminDtos` javadoc 한 줄뿐 |
| `check-all.sh docs` · `quick` | 통과 |

- 원본 : `.issue/387/evidence/after/checks.txt`

### 남은 이슈
- 없음
