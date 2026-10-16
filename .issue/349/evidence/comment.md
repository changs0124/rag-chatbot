## 작업 요약

새 대화에서 보낼 때 `useChat.send` 가 `createConversation` 을 부르기 **전에** `true` 를 돌려주던 것을, 생성 왕복이 끝난 뒤에 받아들임을 정하도록 고쳤다.
생성이 실패하면(네트워크 · 5xx · 429) 오류 배너 「대화를 만들 수 없습니다」는 그대로 뜨고, 입력과 첨부 초안은 남아 그대로 다시 보낼 수 있다.

- `send` 는 `Promise<boolean>` 을 돌려준다. 기존 대화는 곧바로, 새 대화는 생성 성공 · 실패 시점에 끝난다. 스트림 완료는 기다리지 않는다(#323 의 이유 유지)
- 거절 판정(스트리밍 · 생성 중 · 이력 로딩 중)과 `creating` 세움은 지금처럼 같은 틱에 끝나 같은 틱의 두 번째 전송도 막힌다
- `Composer` 는 결과를 기다린 뒤 받아들였을 때만 비운다. 기다리는 동안은 `busy` 가 Enter · 버튼을 막는다
- 기다리는 사이 이어 쓴 글 · 더한 첨부는 받아들여진 뒤에도 남는다 — 보낸 카드만 걷는다(대기 구간이 생기면서 새로 막아야 했던 유실 경로)
- 생성은 됐지만 그사이 다른 대화로 옮겨 턴을 버린 경우도 보낸 것이 없으므로 `false` 다

## 변경 전후

화면 캡처는 두지 않았다. 생성 API 실패를 화면에서 재현하려면 백엔드에 장애를 주입해야 하고, 판정 대상(입력 · 첨부가 남는지, `send` 가 무엇으로 끝나는지)은
테스트가 직접 단언하는 값이라 테스트 출력이 더 정확한 증거다.

변경 전 — 새 회귀 테스트 2건이 수정 전 소스에서 실패(`evidence/before/regression-test.txt`)

```
 FAIL  src/hooks/useChatRace.test.ts > useChat 대화 컨텍스트 경쟁 > 생성 요청이 실패하면 send 가 false 로 끝나고 오류를 띄운다
AssertionError: expected true to be false // Object.is equality

 FAIL  src/components/chat/Composer.test.tsx > Composer > onSend 가 나중에 받지 않음으로 끝나면 입력과 첨부 카드가 남음
Error: expect(element).toHaveValue(남아야 함)
Expected the element to have value:
  남아야 함
Received:
```

변경 후 — 같은 테스트와 대기 구간 케이스 통과(`evidence/after/regression-test.txt`)

```
 ✓ src/hooks/useChatRace.test.ts > useChat 대화 컨텍스트 경쟁 > 생성 요청이 실패하면 send 가 false 로 끝나고 오류를 띄운다
 ✓ src/components/chat/Composer.test.tsx > Composer > onSend 가 나중에 받지 않음으로 끝나면 입력과 첨부 카드가 남음
 ✓ src/components/chat/Composer.test.tsx > Composer > 받아들임을 기다리는 사이 더한 입력과 첨부는 남음
```

## 변경 파일

- `frontend/src/hooks/useChat.ts` — `run` 이 생성 왕복 결과를 `settle` 로 알리고, `send` 가 `Promise<boolean>` 을 돌려준다
- `frontend/src/components/chat/Composer.tsx` — `onSend` 결과를 기다린 뒤 받아들였을 때만 보낸 것만 걷는다
- `frontend/src/hooks/useChatRace.test.ts` · `frontend/src/components/chat/Composer.test.tsx` — 회귀 테스트 3건, #323 F2 케이스는 반환값을 기다려 판정
- `frontend/src/hooks/useChatLoading.test.ts` — #323 F1 케이스 3건이 반환값을 기다려 판정(기대값 그대로)
- `docs/02_architecture/frontend.md` — 「받아들였을 때만 비운다」 규칙 문장을 생성 왕복 뒤 판정으로
- `scripts/case-floors.env` — `FRONTEND_MIN` 172 → 175(실측)
- `docs/06_changelog/CHANGELOG.md` — `[Unreleased]` Fixed 항목

## 검증

- `npm run lint` — 경고 · 오류 0
- `npm test` — 175 passed (변경 전 172)
- `npm run build` — 타입 오류 없음
- `check-case-floor.sh frontend` — 실측 175 / 하한 175
- `bash scripts/check-all.sh docs` — 통과(로컬에 shellcheck 가 없어 셸 정적 분석 1건은 건너뜀, CI 에서 돈다)

## 남은 이슈

- 생성 중 다른 대화로 옮겨 턴을 버린 경우 입력이 옮겨 간 대화의 입력창에 남는다. 사라지는 것보다 낫다고 보고 이렇게 두었다
