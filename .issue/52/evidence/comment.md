## 결론

`scripts/check-doc-versions.sh` 를 만들어 **CI 의 `backend` 잡에 붙였다.** 오늘의 실패를 재현해 잡는 것을 확인했다.

## 합격선 — 재현으로 확인했다

```text
### JUnit 5 로 되돌림 (#51 이전 상태)
FAIL: docs/INDEX.md:16 — 문서는 'JUnit 5' 인데 실제는 6.0.3

### Spring Boot 3.5.16 으로 되돌림 (#48 이전 상태)
FAIL: docs/INDEX.md:12 — 문서는 'Spring Boot 3.5.16' 인데 실제는 4.1.1

### React Router 7 로 조작
FAIL: docs/02_architecture/frontend.md:19 — 문서는 'React Router 7' 인데 실제는 8.3.0
```

정상 상태에서는 **24건 대조 · 오탐 0** 이다.

## 사각을 실측해 두었다

만들기 전에 `JUnit 5` 로 되돌린 상태에서 기존 게이트를 돌려 봤다.

```text
check-doc-refs.sh          통과(초록)   ← 경로 실재만 봄
check-runtime-versions.sh  통과(초록)   ← java.version · .nvmrc 두 런타임만
check-response-contract.sh 통과(초록)   ← DocumentResponse 필드 이름만
check-case-floor.sh        (케이스 수만)
```

**거짓인 문서를 아무도 막지 못했다.** #51 이 그 상태로 main 에 들어갔던 이유가 이것이다.

## 설계 판단 셋

### 1. `docs` 잡이 아니라 `backend` 잡에 붙였다

```yaml
docs:
  steps:
    - uses: actions/checkout@v4
    - run: bash scripts/check-doc-refs.sh    # JDK · Node 없음
```

**JUnit 은 `pom.xml` 에 없고 Spring Boot BOM 이 관리한다.** `docs` 잡에 붙였으면 **정작 잡아야 할 것을 못 잡았다.** `backend` 잡은 이미 `./mvnw -B verify` 로 m2 를 채우므로, BOM pom 을 **파일로 읽는다** — maven 을 다시 실행하지 않아 추가 비용이 사실상 없다.

### 2. 전수 검사 대신 선언한 이름만 본다

문서의 모든 숫자를 훑으면 날짜·이슈 번호·산문 속 예시까지 걸려 오탐이 쏟아진다. **게이트가 시끄러우면 사람들이 무시하게 되고, 그러면 없는 것과 같다.** 스크립트 안의 표에 있는 이름만 본다. 대상을 늘리려면 표에 줄을 추가한다.

### 3. 접두 일치

문서는 메이저만 적기도 한다. `overview.md` 의 mermaid 노드가 `Spring Boot 4.1` 이다.

```text
문서 4.1  실제 4.1.1  → 통과      문서 5  실제 6.0.3  → 실패
```

**긴 이름을 먼저 매칭한다** — `React` 가 앞에 오면 `React Router 8` 을 `React 8` 로 읽어 오탐이 난다. 재현 3번이 이 순서를 잠근다.

## 무엇을 못 잡는지 머리 주석에 적었다

`check-response-contract.sh` 가 선례다 — 좁게 보되 사각을 명시한다.

```text
- 표에 없는 라이브러리 (Testcontainers · Flyway · Jackson 은 문서가 버전을 주장하지 않아 제외)
- 이름 없이 숫자만 적힌 서술 ("4.1 로 올렸다")
- docs/06_changelog/** — 이력이라 당시 값이 맞다. 일부러 제외
- 버전을 아예 안 적은 서술 — 없는 주장은 틀릴 수 없다
```

## 구현 중 걸린 것

`pom.xml` 들여쓰기가 **탭**이라 `tr -d '\r\n'` 으로 개행만 지우면 태그가 붙지 않아 `<artifactId>X</artifactId><version>` 패턴이 매칭되지 않았다. 여백까지 지워 해결했다.

## 완료 기준 대조

- [x] 문서의 버전 주장과 실제가 어긋나면 실패한다
- [x] **오늘의 실패 사례를 재현해 잡는다** — `JUnit 5` 로 되돌리면 빨간불
- [x] 현재 문서에서 오탐 0 (24건 대조 통과)
- [x] 대조 범위와 **사각**을 머리 주석에 명시
- [x] CI 에 붙임 — `backend` 잡 (이유를 워크플로 주석에 적음)
- [x] `backlog.md` 정리 · `CHANGELOG.md`

## 범위 밖 — 그리고 발견한 것

「…」 섹션 이름 대조는 이 이슈가 아니다. `backlog.md` 의 별도 항목으로 남겼고, 버전 쪽만 닫혔다는 주석을 달았다.

**작업 중 별개의 문서 부정확을 하나 발견했다.** `docs/INDEX.md:18` 의 CI 잡 목록에서 **`contract` 잡이 빠져 있다.** 버전 주장이 아니라 이 게이트로는 안 잡히고, 이 이슈 완료 기준에도 없어 **고치지 않고 남긴다.**

## 증거

- [게이트 사각 재현 (변경 전)](../blob/main/.issue/52/evidence/before/게이트-사각-재현.md)
- [게이트 동작 (변경 후)](../blob/main/.issue/52/evidence/after/게이트-동작.md)
