## 무엇을 했나

응답 계약을 **이름**과 **값** 두 축으로 고정했다. 착수 전에 이슈의 완료 조건을 먼저 실측했고, 그 결과 조건 자체를 바꿔 잡았다.

## 이슈의 전제 하나가 사실과 달랐다

> `RagDocumentRepository.xml` 의 `<constructor>` arg 순서를 임의로 바꿨을 때 **테스트가 실패할 것**

**이미 실패한다.** pure 워크트리에서 `status` ↔ `uploaded_by_name` 을 바꿔 돌린 결과다.

```
[ERROR] AdminDocumentFlowTest.admin_uploads_pdf_and_sees_it_in_list:89
expected: "사용자"
 but was: "completed"
[ERROR] Tests run: 13, Failures: 1
```

MyBatis 는 `javaType` 시퀀스로 생성자를 찾는다. 타입이 다른 arg 끼리의 교환은 생성자를 못 찾아 질의 시점에 터지고, 타입 시퀀스를 보존하는 교환은 String 셋(`filename` · `status` · `uploadedByName`) 사이뿐이다. 3원소 순열은 항등이 아니면 최소 둘을 움직이므로 `status` 하나만 어긋나는 순열이 없다 — 기존 두 단언이 이미 그물을 덮고 있었다.

## 진짜 구멍은 순서가 아니라 컬럼 결선이었다

`byte_size` 를 `0` 으로, `status` 를 리터럴로, `created_at` 을 조인한 `users` 쪽 값으로 바꿨다.

```
[INFO] Tests run: 13, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

**13개가 전부 통과한다.** 그래서 완료 조건을 「순서 교환 → 실패」에서 「결선 교란 → 실패」로 바꿔 잡았다.

## 프론트도 실측했다

`RagDocument` 에 **필수** 필드를 하나 더한 상태에서 `npm run build` 와 케이스 74개가 전부 통과했다. `tsconfig.app.json:26` 이 `src/**/*.test.tsx` 를 exclude 하고 vitest 는 타입을 보지 않아, `doc()` 픽스처가 어느 게이트도 거치지 않는다. 이슈가 적은 「영원히 초록」은 그대로 사실이었다.

## 무엇을 넣었나

**값 축** — `AdminDocumentFlowTest` 에 목록 한 행의 여섯 필드를 출처와 대조하는 케이스 1건. 셋을 **따로** 교란해 각각이 개별 단언에 걸리는 것을 확인했다(합쳐 돌리면 첫 실패만 보고돼 나머지를 증명하지 못한다).

| 교란 | 걸린 단언 | 결과 |
|---|---|---|
| `byte_size` → `0` | `:126` byteSize | expected 22L / but was 0L |
| `status` → 리터럴 | `:128` status | expected "completed" / but was "in_progress" |
| `created_at` → `u.created_at` | `:133` createdAt | 두 시각이 갈림 |
| 교란 없음 | — | 14개 통과 |

`createdAt` 은 두 시각을 재서 비교하는 것이 아니라 **같은 컬럼을 두 경로로 읽어** 맞추는 것이라 시계 해상도와 무관하다 — CONVENTIONS 의 「시각에 등호를 걸지 않는다」에 걸리지 않는다.

**이름 축** — `scripts/check-response-contract.sh` 와 CI 잡 `contract`. 네 곳을 대조한다.

```
AdminDtos.DocumentResponse   id filename byteSize status uploadedByName createdAt
summaryResult <arg column>   id filename byteSize status uploadedByName createdAt
types.ts RagDocument         id filename byteSize status uploadedByName createdAt
AdminPage.test.tsx doc()     id filename byteSize status uploadedByName createdAt
✓ 응답 계약 4곳 일치 (6필드)
```

record ↔ `resultMap` 은 **순서까지**(MyBatis 가 위치로 생성자를 찾으므로), record ↔ 프론트 두 곳은 이름 집합만 본다. 네 출처를 하나씩 어긋뜨려 전부 걸리는 것을 확인했고, 추출이 깨지면 조용히 통과하지 않고 `대조 실패` 로 사유를 찍는 것까지 확인했다.

## 기각한 대안

- **OpenAPI 스키마 → 프론트 타입 자동 생성** : 끊어진 자리를 잇자고 의존성 2개와 생성물 커밋을 들이는 것은 비용이 맞지 않는다
- **백엔드 테스트가 실제 응답을 픽스처로 내보내고 프론트가 읽기** : 백엔드 테스트를 안 돌리면 픽스처가 낡는다. **낡은 픽스처는 지금보다 나쁘다**
- **tsconfig 의 exclude 를 걷어 테스트까지 타입 검사** : 기존 오류 3건(`ErrorBoundary.test.tsx` · `useChat.test.ts` 2곳)을 먼저 고쳐야 해 원인이 다른 변경이 섞인다. `docs/04_tasks/backlog.md` 에 남겼다

## 검증

```
backend   ./mvnw clean verify   Tests run: 165, Failures: 0, Errors: 0   BUILD SUCCESS
frontend  vitest                74 passed (74)   ·  oxlint 통과  ·  build 통과
게이트     check-case-floor backend 165/165 · frontend 74/74
          check-response-contract 4곳 일치 · check-doc-refs 184건 통과
```

`BACKEND_MIN` 을 164 → 165 로 올렸다.
