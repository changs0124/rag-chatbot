## 작업 리포트 — #390 프론트 중복 정리 · AdminPage 섹션 분리

브랜치 `refactor/390-frontend-authfetch-admin-sections`

### 변경
- **`authFetch`**(`api.ts`) : 보낸 토큰 기억 → Bearer → `fetch` → 재발급 토큰 반영을 한 곳에. `request` · `streamChat` · `loadFigure` 가 모두 이것을 지난다. 오류 변환(그림 404 → null, 스트림 `onError`, 자격 경로 401 예외)과 abort 신호는 호출부에 그대로
- **`AdminPage`** : 같은 파일 안에서 `DocumentsSection` · `UsersSection` 으로 나눔. 목록 로드 · 폴링 · 오류 배너 · 관리자 가드는 `AdminPage` 에 남기고, 각 섹션 상태 · 핸들러 · 모달은 그 섹션으로. 마크업 · 클래스 · 문구 그대로
- `ChatMessage.status` → `'streaming' | 'complete' | 'error'`(DB 는 complete · error 만, streaming 은 프론트 전용) · `createConversation(title)` 필수
- ChatPage 헤더 버튼 · Composer 원형 버튼의 같은 클래스 문자열 → 파일 지역 상수(최종 클래스 문자열 동일)
- 하지 않은 것 : `onDone` 페이로드 타입 축소 — `useChat.test.ts` 가 페이로드로 호출해 타입 검사가 깨진다. 테스트까지 고칠 가치는 없어 그대로

### 증거 — 동작 불변 확인(리팩터라 화면 변화 없음)

| 측정 | 전 | 후 |
| --- | ---: | ---: |
| 프론트 테스트 | 191 통과 | **191 통과** |
| `AdminPage.test.tsx` | 수정 없음 | 그대로 통과 |
| 변경 규모 | - | 7 파일 +172 / −115 |

- 원본 : `.issue/390/evidence/after/checks.txt`

### 검증
- `bash scripts/check-all.sh` 전부 통과(백엔드 321 · 프론트 191, main 합친 뒤) · oxlint · `tsc -b` · build

### 남은 이슈
- 없음
