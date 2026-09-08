## 결론

**이미 회수되고 있었다.** 세 곳의 "영구 잔류" 서술을 사실과 맞췄고, **테스트는 추가하지 않았다** — 이미 있었다.

## 코드는 진작 고쳐져 있었다

`FileService.cleanupUnreferencedFiles` 가 **2026-07-28 에 추가돼** 파일 쪽에서 돌며 *가리키는 행이 없는* 것을 회수한다. `OrphanCleanupScheduler` 가 매시 정각 **2차 패스**로 부른다. cascade 로 행이 먼저 사라진 뒤 남은 파일이 정확히 그 대상이다.

시나리오는 **테스트로도 이미 잠겨 있었다.**

```text
FileFlowTest
  unreferenced_old_file_is_removed_by_scan   행만 지우고 → 파일이 회수됨
  referenced_file_is_kept_by_scan            행이 살아 있으면 안 지움
  fresh_unreferenced_file_is_kept_by_scan    방금 올라온 건 유예로 보호

$ ./mvnw -Dtest='FileFlowTest#…' test    →  tests="3"  failures="0"  errors="0"
```

첫 케이스의 javadoc 이 이 상황을 그대로 적고 있다 — *"대화 삭제 시 cascade 로 행이 먼저 사라진 뒤 파일 삭제가 실패하면 … 저장소 스캔 패스가 그 잔류를 지워야 함"*.

## 그런데 세 곳이 아직 "영구 잔류" 라고 말했다

### 가장 나빴던 것 — 운영 로그

```text
- "대화 삭제 후 첨부 파일 정리 실패 - 행이 이미 없어 고아 회수 대상도 아님(영구 잔류). path={}"
+ "대화 삭제 후 첨부 파일 정리 실패 - 행이 없어 행 기준 회수는 못 보지만
+  저장소 스캔 회수가 다음 주기에 지움. path={}"
```

**이게 그대로 운영 로그로 나간다.** 실제로는 다음 정각에 회수되는데 읽는 사람은 파일이 영영 사라졌다고 판단한다 — **없는 사고를 쫓게 만드는 거짓 경고다.** 왜 그렇게 적지 않는지 코드 옆에 주석으로 남겼다.

### `ConversationService.delete` javadoc

행 기준 회수가 못 본다는 사실은 그대로 뒀다(참이다). **무엇이 그 잔류를 지우는지**를 이어 붙이고 **잠그는 테스트 이름**을 적었다 — 다음 사람이 근거를 바로 찾는다.

### `backlog.md`

해당 항목 제거.

## 테스트를 추가하지 않은 이유

완료 기준이 "회수가 실제로 도는지 테스트로 확인한다 — **없으면** 추가한다" 였고, 있었다. **이미 잠긴 것을 다시 잠그면 래칫만 올라가고 보호는 늘지 않는다.** 케이스 수는 184 그대로다.

## 검증

```text
[INFO] Tests run: 184, Failures: 0, Errors: 0, Skipped: 0   BUILD SUCCESS
check-doc-versions · check-doc-refs · check-runtime-versions · check-response-contract · check-case-floor  전부 OK
```

## 손대지 않은 곳

```text
FileService.java:150  "종전에 경고 로그만 남기고 영구 잔류했음(2026-07-28 결정으로 이 패스를 넣음)"
                      → 과거형이고 사실이다. 이 패스가 왜 생겼는지의 기록이라 그대로 둔다
```

## 완료 기준 대조

- [x] 로그 문자열이 회수 경로가 있음을 반영 — "영구 잔류" 제거
- [x] javadoc 이 `cleanupUnreferencedFiles` 2차 패스를 가리킴
- [x] `backlog.md` 항목 제거
- [x] 회수가 실제로 도는지 테스트로 확인 — 이미 있었고 3건 통과. **추가하지 않음**
- [x] 같은 취지의 낡은 서술 훑기 — `FileService:150` 은 과거형이라 유지
- [x] `CHANGELOG.md`

## 남은 절반 — 범위 밖임을 확인했다

`AdminDocumentService.upload` 는 OpenAI 업로드 → `documentRepository.insert(...)` 인데 insert 가 실패하면 보상이 없고 **회수할 방법도 없다.**

```text
$ grep -rn "@Scheduled" backend/src/main/java/
OrphanCleanupScheduler.java:33     ← 하나뿐. 로컬 디스크만 스캔

$ grep -rn "listFiles|vector_stores\"" backend/src/main/java/com/ragchatbot/openai/
(없음)                              ← OpenAI 리소스를 조회하는 코드 자체가 없다
```

**보상을 어떻게 넣을지 설계 판단이 필요해 별도 이슈로 남긴다.** `backlog.md` 에 그대로 있다.

## 증거

- [변경 전 서술 대조](../blob/main/.issue/57/evidence/before/현재서술-대조.md)
- [변경 후 서술](../blob/main/.issue/57/evidence/after/변경후-서술.md)
