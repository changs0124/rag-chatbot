## 결론 — A+B, `max-swallow-size: 32MB`

이슈가 적은 A/B 는 둘 다 반쪽이었다. **재 보니 A 는 경계를 없애지 못하고 옮길 뿐**이다.
그래서 봉투를 덮는 유한한 값을 넣고 **경계가 어디인지 문서에 적는** 쪽으로 갔다.

## 1. 실측 — 크기별로 무엇이 돌아오는가

이슈 완료 조건이 「추정으로 닫지 않는다」였으므로 결정보다 측정을 먼저 했다.
`AbstractPgIntegrationTest` 가 `RANDOM_PORT` 라 **실 Tomcat** 이 뜬다 — 연결 끊김도 413 도 실물이다.

| 요청 크기 | 전 (미설정 → 기본 2MiB) | 후 (32MB) |
|---|---|---|
| 25MB+1KB (코드 상한 초과) | 400 `BAD_REQUEST` | 400 — 그대로 |
| **26MB+1KB** (#64 실측 지점) | **연결 끊김** | **413 `PAYLOAD_TOO_LARGE`** |
| 28MB | **연결 끊김** | **413** |
| 31MB (봉투 끝) | **연결 끊김** | **413** |
| 34MB | 연결 끊김 | 연결 끊김 |
| 45MB | 연결 끊김 | 연결 끊김 |

원본 : [전](../blob/main/.issue/70/evidence/before/overflow-sizes.txt) · [후](../blob/main/.issue/70/evidence/after/overflow-sizes.txt)

**이슈 표의 「26MB 초과 ~28MB」 미확인 칸도 채웠다** — 전에는 여기도 끊겼다. 추정이 하나도 안 남았다.

## 2. A 는 경계를 없애지 않는다 — 이것도 쟀다

`maxSwallowSize` 는 **남은 본문**에 걸리므로 그 값이 곧 새 경계다. swallow 를 40MB 로 올려 재 보면:

```text
max-swallow-size=40MB
  26MB+1KB → 413        28MB → 413        31MB → 413
  34MB     → 413   ← 32MB 설정에서는 끊기던 크기
  45MB     → 응답 없음   ← 경계가 40MB 로 옮겨갔을 뿐
```

원본 : [swallow 를 바꿔 가며 잰 것](../blob/main/.issue/70/evidence/boundary-moves-with-swallow.txt)

**없애려면 `-1`(무제한)뿐인데 택하지 않았다.** 그러면 거절하기로 이미 정한 요청의 본문을
끝까지 읽는다 — Tomcat 이 2MiB 를 기본값으로 둔 이유가 그것이다.

## 3. 왜 32MB 인가

`max-request-size` 가 31MB 다. **서버가 받아 줄 여지가 있는 구간 전체가 413 으로 덮이는 최소값**이
32MB 다. 1MB 여유는 이 저장소가 이미 쓰는 방식 — `max-file-size`(26MB)가 코드 상한(25MB)보다
1MB 큰 것과 같은 역할이다.

그 위(34MB·45MB)는 어차피 무조건 거절할 요청이며, **끊긴다는 사실을 `api.md` 에 적었다.**

## 변경 파일

- `backend/src/main/resources/application.yml` — `server.tomcat.max-swallow-size: 32MB`.
  값의 근거와 **왜 무제한이 아닌지**를 주석에 남겼다
- `backend/src/test/.../AdminDocumentFlowTest.java` — **`TC-ADMIN-035`** 신규.
  바로 위 `TC-ADMIN-025`(「413 이 **아니라** 400」)와 짝이다.
  **이 케이스가 I/O 오류로 깨지면 설정이 지워졌거나 낮아진 것이다**
- `docs/01_specs/api.md` — 오류 코드 표에 경계 명시
- `docs/04_tasks/backlog.md` — 해소되어 항목 제거
- `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env` (184 → 185)

## 검증

```text
./mvnw -o clean test        185 통과 · BUILD SUCCESS   (Testcontainers 실 PostgreSQL)
check-case-floor.sh backend 실측 185 / 하한 185  OK
check-doc-refs.sh · check-doc-sections.sh · check-response-contract.sh  OK
```

**케이스 수는 clean 후에 쟀다.** 처음엔 186 이 나왔는데, 삭제한 측정용 프로브 클래스의 surefire
XML 이 `target/` 에 남아 1건 부풀린 것이었다 — 스크립트 머리 주석이 경고하는 바로 그 함정이다.

## 남은 것

없다. 완료 조건 넷을 모두 채웠다.

- [x] A / B 중 하나를 고르고 근거를 남긴다 → **A+B**, 근거는 위 1·2절 실측
- [x] 고른 쪽에 맞춰 코드와 `api.md` 를 고친다
- [x] 413 경로를 잠그는 테스트 → `TC-ADMIN-035`
- [x] 실측으로 확인 (미확인 칸 포함)

`BACKEND_MIN` 은 **이 브랜치 실측값 185** 다. 이 브랜치는 #37 이 merge 되기 전 main 에서
갈라져서, 둘이 함께 들어가면 187 이 된다 — merge 때 조정이 필요하다.
