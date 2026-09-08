## 결론

주석 4곳과 문서 2곳을 고쳤다. **코드 동작은 하나도 바꾸지 않았다.**

## 1. `useChat.test.ts` — 값이 테스트를 가르지 않는다

`onDone` 에 `noSource` 를 다르게 넣은 두 케이스의 주석이 그 값이 결과를 가르는 것처럼 읽혔다. **실제 핸들러는 인자를 받지 않는다.**

```ts
// useChat.ts:178
onDone: () => { patch((m) => ({ ...m, status: 'complete' })); refreshConversations() },
```

`noSource` 도 `finishReason` 도 훅 어디에서도 읽지 않는다. 단언 결과는 그 값과 무관하다.

**값은 지우지 않았다** — 시그니처를 맞추고 서버 계약을 재현하는 값이라 두는 것이 맞다. 바꾼 것은 **그 값이 무엇을 하는지에 대한 설명**이다. 지금 검증되는 것은 "`onDone` 이 왔다는 사실" 하나이고, `noSource` 가 나중에 무자료 배너 같은 실제 분기에 쓰이면 **그 분기는 여기서 안 잡힌다**는 것을 적었다.

## 2. `check-doc-sections.sh` — 다섯째 사각을 적었다

머리 주석이 사각을 넷 적었는데 하나가 빠져 있었다.

```text
docs/02_architecture/backend.md:222
  … [features.md](…) FEAT-ADMIN-002 「soft delete 를 쓰는 이유」에 있다.
                     ^^^^^^^^^^^^^^^ 이것 때문에 수집에서 빠짐
```

PATTERN 이 파일 참조와 `「` 사이에 **공백만** 허용한다. **로케일 버그와 같은 실패 모드**다 — 경고 없이 사라진다. 그 게이트를 만들 때 정확히 그 함정을 밟았고, 머리 주석에 사각을 적는 이유가 그것이었는데 이 케이스를 빠뜨렸다.

**패턴을 넓히지 않았다.** 그 대상은 `features.md:302` 에서 **헤딩이 아니라 굵은글씨**다.

```text
**soft delete 를 쓰는 이유** : "언제 내려갔는가"가 감사 대상이다(REQ-ADMIN-002). …
```

즉 「…」 가 굵은 라벨을 가리키는 다섯째 갈래이고, 잡으려면 `has_section()` 도 함께 넓혀야 한다. **근거가 한 건뿐일 때 게이트를 만들지 않는다**([#55](https://github.com/changs0124/rag-chatbot/issues/55) 기준). **왜 넓히지 않는지까지 주석에 적었다** — 다음 사람이 "빠뜨린 것" 으로 오해해 무심코 넓히면 오탐이 난다.

## 3. `backlog.md` — `postgresql` 하한

[#48](https://github.com/changs0124/rag-chatbot/issues/48) 에서 수동 고정을 뺀 뒤 **하한을 주장하는 것이 없다.** enforcer 규칙도, `check-doc-versions.sh` 검사표 항목도 없고, Trivy 는 BOM 해석에 의존한다. **현재 42.7.13 이라 노출은 없다.**

고를 것 셋(enforcer / 검사표 확장 / 재고정)과 함께 등재했다.

## 검증

```text
npm run build  EXIT=0   npm run lint  EXIT=0   npm test  76/76
check-case-floor(frontend) · check-doc-sections · check-doc-refs · check-doc-versions  전부 OK
```

## 완료 기준 대조

- [x] `useChat.test.ts` 두 주석이 실제로 검증되는 것만 말한다
- [x] `check-doc-sections.sh` 에 다섯째 갈래 추가 — 넓히지 않는 이유까지
- [x] `backlog.md` 에 `postgresql` 하한 등재
- [x] 게이트 · 프론트 76건 그대로
- [x] `CHANGELOG.md`

## 이 이슈의 성격

오늘 닫은 이슈의 절반(#47·#51·#55·#57)이 **코드가 앞서가고 서술이 남은 것**이었다. 이 둘은 **반대 방향** — 서술이 앞서가고 코드가 못 따라갔다. 같은 뿌리의 다른 얼굴이다.

## 증거

- [과장된 서술 (변경 전)](../blob/main/.issue/65/evidence/before/과장된-서술.md)
- [변경 후 서술](../blob/main/.issue/65/evidence/after/변경후-서술.md)
