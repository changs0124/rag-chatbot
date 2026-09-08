관련 이슈 #55

## 결론

문서 두 곳의 **구성 목록**을 실제와 맞췄다. 둘 다 원인이 같다 — 목록형 서술이 실제 구성을 따라가지 못했다.

## 무엇이 어긋났나

```text
docs/INDEX.md:18
- (backend · frontend · docker · docs · secrets · deps × 2)              7개
+ (backend · frontend · docker · contract · docs · secrets · deps × 2)   8개 ← 실제와 일치

docs/CONVENTIONS.md 「테스트·CI 게이트」
  래칫 · check-doc-refs · check-runtime-versions · check-response-contract · gitleaks/Trivy
+ check-doc-versions.sh                                                   ← #52 에서 만든 게이트
```

## #52 가 자기 자신을 목록에 넣지 않았다

게이트를 만들면서 **게이트를 나열하는 문서를 갱신하지 않았다.** [#48](https://github.com/changs0124/rag-chatbot/issues/48) → [#51](https://github.com/changs0124/rag-chatbot/issues/51) 과 같은 종류의 누락이다 — 그때는 버전 값, 이번엔 구성 목록.

## 어떤 게이트도 이걸 못 잡는다

```text
check-doc-versions.sh (#52)  버전 주장만 봄 → 이건 목록이라 대상 아님
check-doc-refs.sh            경로 실재만 봄 → ci.yml 이 존재하므로 통과
check-runtime-versions.sh    java.version · .nvmrc 만
check-response-contract.sh   DocumentResponse 필드만
check-case-floor.sh          케이스 수만
```

**다섯 게이트가 전부 초록인 상태에서 두 문장이 거짓이었다.** 고친 뒤에도 다섯 개 다 초록이다 — 이 게이트들로는 애초에 잡을 수 없는 결함이다.

## `CONVENTIONS.md` 에 사각을 명시했다

그 절의 다른 게이트가 전부 "무엇을 못 잡는지" 를 적고 있어 같은 형식을 따랐다.

```text
못 잡음 : 표에 없는 라이브러리 · 이름 없이 숫자만 적힌 서술 · docs/06_changelog/** ·
          그리고 **버전이 아닌 목록형 서술**(CI 잡 목록 · 이 게이트 목록 자체)
```

마지막 줄이 핵심이다. **이 게이트 목록 자체가 그 사각이고, 그래서 이번 누락이 생겼다.** 다음에 읽는 사람이 함정을 알고 시작한다.

## 자동 검사를 만들지 않은 이유

만들 수는 있다(`ci.yml` 의 `name:` ↔ 문서, `scripts/*.sh` ↔ 문서). **하지만 근거가 이 한 건뿐이다.**

[#52](https://github.com/changs0124/rag-chatbot/issues/52) 는 달랐다 — 실제로 새어 main 에 들어간 사례(JUnit)가 있었고 재현 테스트로 합격선을 정의할 수 있었다. 이번엔 그 근거가 없다. **게이트를 늘리는 것 자체가 비용이고, 오탐이 나면 무시당해 없는 것과 같아진다.**

반복되면 그때 근거를 모아 별도로 판단한다.

## 다른 목록형 서술 — 훑었고 없다

```text
INDEX.md:94      개별 진술이지 목록이 아니다. 여전히 참
INDEX.md 실행절   문서 읽는 순서 안내 — 구성 목록 아님
frontend.md:103  개별 테스트 언급 — 목록 아님
```

## 완료 기준 대조

- [x] `INDEX.md` CI 잡 목록에 `contract` 추가 — 실제 8개와 일치
- [x] `CONVENTIONS.md` 게이트 목록에 `check-doc-versions.sh` 추가 — 보는 것·못 보는 것·`backend` 잡인 이유까지
- [x] 같은 종류의 목록형 서술 다른 곳 훑기 — 없음
- [x] `CHANGELOG.md`

## 증거

- [변경 전 목록 대조](../blob/main/.issue/55/evidence/before/현재목록-대조.md)
- [변경 후 목록 대조](../blob/main/.issue/55/evidence/after/변경후-대조.md)
