관련 이슈 #51

## 결론

`docs/INDEX.md:16` 의 **`JUnit 5` → `JUnit 6`.** 나머지 12곳은 전수 대조해 이상 없음을 확인했다.

## 무엇이 어긋났나

```text
- | 테스트 | 백엔드 JUnit 5 + Testcontainers(실 PostgreSQL) · ... |
+ | 테스트 | 백엔드 JUnit 6 + Testcontainers(실 PostgreSQL) · ... |
```

Spring Boot 4.1.1 BOM 의 `junit-jupiter.version` 이 `6.0.3` 이다. [#48](https://github.com/changs0124/rag-chatbot/issues/48) 로 parent 를 올릴 때 함께 올라갔다.

```text
$ cd backend && ./mvnw dependency:list | grep -i junit
org.junit.jupiter:junit-jupiter:jar:6.0.3:test
org.junit.platform:junit-platform-commons:jar:6.0.3:test
```

## 왜 놓쳤나

#48 에서 **버전 문자열이 적힌 곳만 훑었다.** `INDEX.md` 의 Backend 행(12행)은 고쳤는데, **같은 표의 「테스트」 행(16행)에도 프레임워크 버전이 들어 있다는 것을 보지 못했다.**

## 게이트 넷이 전부 초록이었다

```text
check-doc-refs.sh          경로 실재만 검사          → 통과
check-runtime-versions.sh  java.version · .nvmrc 만  → 통과
check-case-floor.sh        케이스 수만               → 통과
check-response-contract.sh DocumentResponse 필드만   → 통과
```

**어느 것도 문서에 적힌 라이브러리 버전을 실제와 대조하지 않는다.** 고치기 전에도 초록이었고 고친 뒤에도 초록이다 — 이 게이트들로는 애초에 잡을 수 없는 결함이다. 사각 자체는 [#52](https://github.com/changs0124/rag-chatbot/issues/52) 로 따로 다룬다.

## 나머지 12곳 — 고칠 것이 없다는 것도 근거를 남긴다

| 위치 | 주장 | 실제 |
|------|------|------|
| `INDEX.md:11` | React 19 · TypeScript 6 · Vite 8 · React Router 8 · Tailwind CSS 4 | `^19.2.7` · `~6.0.2` · `^8.1.1` · `^8.3.0` · `^4.3.3` |
| `INDEX.md:12` · `backend.md:3` | Java 17 · Spring Boot 4.1.1 · MyBatis 4.1.0 | `pom.xml` 과 동일 |
| `frontend.md:3` · `overview.md:11` | React 19 · Vite 8 · Tailwind 4 | 동일 |
| `frontend.md:19` · `overview.md:42` | React Router 8 | `^8.3.0` |
| `overview.md:12` · `:158` · `backlog.md:11` | Spring Boot 4.1 / 4.1.1 | 동일 |
| `design-system.md:53` | Tailwind 4 | `^4.3.3` |
| `README.md:12` | Spring Boot + Java 17 | 버전 미주장 |

**`CHANGELOG.md` 는 손대지 않았다** — 이력 서술이라 당시 값이 맞다.

## 완료 기준 대조

- [x] `docs/INDEX.md:16` 의 `JUnit 5` → `JUnit 6`
- [x] 같은 표의 다른 행 대조 — Frontend 행도 `package.json` 과 일치
- [x] `docs/` 전체에서 버전을 주장하는 곳 전수 훑기 — 13곳 중 1곳만 어긋났다
- [x] `CHANGELOG.md` 이력은 건드리지 않음

## 남은 사각 — 정직하게 적는다

이번에는 **사람이 눈으로** 전수 대조했다. 같은 방식이 다음 업그레이드에서도 통한다는 보장이 없다 — **이번 누락이 정확히 그 방식의 실패였다.** #52 가 닫히기 전까지 이 표는 다시 낡을 수 있다.

## 증거

- [변경 전 전수 대조](../blob/main/.issue/51/evidence/before/현재표기-대조.md)
- [변경 후 전수 대조](../blob/main/.issue/51/evidence/after/변경후-대조.md)
