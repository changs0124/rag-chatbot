## 작업 리포트 — 끊긴 SSE 의 에러 페이지 INCLUDE 디스패치 ERROR

**원인** : 끊긴 스트림의 비동기 오류 → Tomcat 이 응답이 이미 커밋돼 `/error` 를 forward 대신 **INCLUDE** 로 부름 → 보안 규칙 `dispatcherTypeMatchers(ASYNC, ERROR)` 에 INCLUDE 가 없어 `AuthorizationFilter` 가 거절 → 커밋된 응답이라 401 도 못 쓰고 ERROR 2줄.

**수정** (`98eb4e6`) : `SecurityConfig` 의 허용 디스패치에 `INCLUDE` 추가. 앱 코드는 `include` 를 쓰지 않고(grep 0) 클라이언트는 INCLUDE 디스패치를 만들 수 없어 보호 경로가 넓어지지 않는다 — 새 테스트가 미인증 `POST /api/chat` 이 여전히 401 임을 같이 고정한다.

### 증거 (백엔드 · 텍스트)

| 항목 | 수정 전 | 수정 후 |
| --- | ---: | ---: |
| 로컬 목업 부하(동시 16 × 3턴 × 3라운드 × 3회, 끊기 25%) | 864요청 · ERROR **8줄**(4건) | 1,296요청 · ERROR **0** · 예외 0 |
| `IncludeDispatchPermitTest` INCLUDE 통과 | **실패** | 통과 |
| 미인증 클라이언트 요청 401 | 통과 | 통과 |
| 전체 `mvnw verify` | — | 415 / 415 |

- 원자료 : [before-load.txt](../tree/main/.issue/517/evidence/before-load.txt) · [after-load.txt](../tree/main/.issue/517/evidence/after-load.txt) · [before-test.txt](../tree/main/.issue/517/evidence/before-test.txt) · [after-test.txt](../tree/main/.issue/517/evidence/after-test.txt)
- 한계 : 빈도가 낮아(컨테이너당 0~8줄) 부하 0 건만으로는 약하다. 결정적 근거는 회귀 테스트(전 실패 → 후 통과)다.
- 문서 : `backend.md` 인가 절 · CHANGELOG `[Unreleased]` · 하한 413 → 415
