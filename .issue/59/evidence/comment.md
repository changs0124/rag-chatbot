## 결론

`tsconfig.app.json` 의 `exclude` 를 걷어 **테스트 파일 9개를 타입 검사 대상에 넣었다.** 드러난 오류 3건을 고쳤고, 되돌리면 빨간불이 되는 것을 재현으로 확인했다.

## 셋 중 하나는 단순한 타입 문제가 아니었다

`useChat.test.ts` 가 `onDone?.()` 을 **인자 없이** 부르고 있었다.

```text
endpoints.ts:63    onDone?: (data: { finishReason: string; noSource: boolean }) => void
endpoints.ts:152   handlers.onDone?.(data as { … })          ← 프로덕션은 넘긴다
ChatService.java:205  Map.of("finishReason", "stop", "noSource", …)   ← 서버가 보내는 것
```

**테스트가 실제 호출 형태와 다르게 통과해 왔다.** 서버가 그 상황에서 실제로 보낼 페이로드를 넘기도록 고쳤다 — **`as any` 를 쓰지 않았다.** 타입만 맞추면 테스트가 계약을 재현하지 못한 채로 남는다.

나머지 둘은 성격이 다르다. `function Boom() { throw ... }` 의 추론 반환 타입이 `void` 라 JSX 컴포넌트로 못 쓴다(런타임은 멀쩡하다). 실제로 절대 반환하지 않으므로 `: never` 로 명시했다 — 사실에 맞는 표기다.

## 게이트가 실제로 문다 — 재현 3건

커밋한 뒤 되돌려 확인했다.

```text
onDone 인자 제거      → TS2554 Expected 1 arguments, but got 0        build EXIT=2
Boom 의 never 제거    → TS2786 cannot be used as a JSX component      build EXIT=2
새 타입 오류 삽입     → TS2322 + TS6133(noUnusedLocals 까지 돈다)      build EXIT=2
원복                 → build EXIT=0
```

세 번째가 중요하다 — **고친 3건만이 아니라 앞으로 들어올 타입 오류 전부**를 막는다.

## CI 스텝을 추가하지 않았다

`npm run build` = `tsc -b && vite build` 이고 `tsc -b` 가 `tsconfig.app.json` 을 탄다. **exclude 를 걷은 것만으로 CI 의 frontend 잡이 검사한다.** 없는 스텝을 만들지 않았다.

## `check-response-contract.sh` 를 지우지 않았다

이 게이트가 픽스처를 따로 보던 **이유의 절반**이 사라졌다. 그래도 남긴다.

```text
타입 검사   픽스처 ↔ RagDocument                    → 이제 tsc 가 본다
이 게이트   RagDocument ↔ 백엔드 record · resultMap  → tsc 는 못 본다
```

**서로 다른 것을 잡는다.** 지웠다면 백엔드↔프론트 필드 대조가 통째로 사라졌을 것이다. 근거를 스크립트 머리 주석과 `CONVENTIONS.md` 양쪽에 적었다.

## 검증

```text
npm run build   EXIT=0  타입 오류 0
npm run lint    EXIT=0
npm test        케이스 76, 실패 0        ← 래칫 76/76, 줄지 않음
check-response-contract.sh  ✓ 4곳 일치
```

## 완료 기준 대조

- [x] `Boom` 이 JSX 컴포넌트 타입을 만족한다
- [x] `onDone` 호출이 실제 시그니처대로 인자를 넘긴다 — `as any` 없이, 서버가 보낼 실제 값으로
- [x] `exclude` 에서 테스트 파일을 뺐다 (`src/test/setup.ts` 까지 포함)
- [x] `tsc` 오류 0
- [x] CI 가 검사한다 — `tsc -b` 경로 확인, 재현 테스트로 증명
- [x] 케이스 수 76 유지
- [x] `backlog.md` 항목 제거 · `CONVENTIONS.md` · `check-response-contract.sh` 주석 · `CHANGELOG.md`

## 증거

- [변경 전 구멍 실측](../blob/main/.issue/59/evidence/before/현재구멍-실측.md)
- [변경 후 검증](../blob/main/.issue/59/evidence/after/변경후-검증.md)
