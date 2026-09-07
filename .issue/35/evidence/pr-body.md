관련 이슈: [#35 fix(backend): 문서 업로드 실효 한도가 25MiB 인데 화면과 문서는 50MB 라고 적는다](https://github.com/changs0124/rag-chatbot/issues/35) (통합 테스트 뒤 close)

## 변경 내용


---

### 숫자만 맞추면 문제가 남는다 — 원인은 숫자가 아니라 순서였다

여덟 곳을 25MB 로 맞추는 것이 이슈의 요구였다. 그런데 그것만으로는 **완료 조건의 "도달 불가능한 분기가 남지 않는다" 를 못 채운다.**

`MB = 1024 * 1024` 이므로 코드의 `25 * MB` 와 Spring 의 `25MB` 는 **정확히 같은 값**(26,214,400)이다. 같으면 멀티파트가 먼저 걷어차 코드 검사가 여전히 실행되지 않는다.

```
            코드 상한        멀티파트 하드 한도    결과
이미지      10MB       <     26MB                 400 이 먼저 (원래부터 정상)
문서 (전)   50MB       >     25MB                 413 만 나옴 · 코드 검사 죽은 분기
문서 (후)   25MB       <     26MB                 400 이 먼저 · 백스톱은 413
```

**이미지 경로는 처음부터 이 순서를 지키고 있었고 문서만 뒤집혀 있었다.** 그래서 숫자를 맞추는 김에 순서를 복구했다 — 코드 25MB < 멀티파트 26MB. 사용자에게 보이는 상한은 **25MB 그대로**이고 26MB 는 그 뒤를 받는 백스톱이다. `max-request-size` 는 파일 한도와의 여유(5MB)를 유지해 31MB 로 옮겼다.

이제 상한을 넘긴 문서는 413 `업로드 용량 한도 초과` 가 아니라 **400 `용량 초과(최대 25MB)`** 를 받는다. 무엇이 문제인지 밝히는 쪽이다.

### 고친 곳 여덟

| 위치 | 전 | 후 |
|---|---|---|
| `AdminDocumentService.java:47` `MAX_SIZE` | `50 * MB` | `25 * MB` |
| `application.yml` `max-file-size` | 25MB | **26MB** (백스톱) |
| 〃 `max-request-size` | 30MB | 31MB |
| 〃 주석 | "이미지 10MB/문서 **20MB**" | "이미지 10MB/문서 25MB" |
| `AdminPage.tsx:174` | 최대 50MB | 최대 25MB |
| `api.md:273` · `features.md:238,243` · `live-integration.md:220` | 50MB | 25MB |
| `overview.md:151` | 파일 25MB · 요청 30MB | 파일 26MB · 요청 31MB (+ 타입별 상한 명시) |

`features.md` 에 **두 한도의 순서가 왜 중요한지**를 적었다. 이번 사고의 원인이 숫자가 아니라 순서였기 때문이다.

### 검증

```
$ ./mvnw -B clean verify
[INFO] Tests run: 178, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS

$ bash scripts/check-case-floor.sh backend      케이스 수(backend) : 실측 178 / 하한 178  OK
$ bash scripts/check-doc-refs.sh                참조 199건 수집 · 192건 검사 통과
$ bash scripts/check-response-contract.sh       ✓ 응답 계약 4곳 일치 (6필드)
$ npx tsc --noEmit -p tsconfig.app.json         OK
$ npx vitest run                                Test Files 13 passed · Tests 76 passed
```

**TC-ADMIN-025** 가 순서를 잠근다 — 25MiB+1KiB 업로드가 400 이고 메시지에 `25MB` 가 들어가는지 본다. **413 으로 바뀌면 두 값이 다시 뒤집혔다는 신호다.**

### 완료 기준 대조

- [x] 한도를 말하는 모든 위치가 같은 숫자를 말한다 (여덟 곳)
- [x] 상한 직전 크기는 201, 직후 크기는 413 이 나오는 케이스가 있다 → **직후는 400 이 되었다.** 코드 검사가 먼저 걸리는 것이 이 이슈가 되살리려던 동작이고, 413 은 26MB 백스톱이 받는다
- [x] 도달 불가능한 분기가 남지 않는다

### 판단이 들어간 지점

이슈의 후보는 「25MB 로 내린다」 와 「멀티파트를 50MB 로 올린다」 둘이었고 **25MB 로 결정**됐다. 다만 그것만으로는 죽은 분기가 남아, 멀티파트를 25 → 26MB 로 **1MB 올렸다.** 사용자에게 보이는 값은 결정대로 25MB 이고, 올린 것은 내부 백스톱이다. 메모리 영향은 파트당 1MB 다.
