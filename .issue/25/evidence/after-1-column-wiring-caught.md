# after-1 : 같은 결선 교란이 이제 각각 잡힌다

세 가지를 **따로** 교란했다. 합쳐서 돌리면 첫 실패만 보고돼 나머지 둘을 증명하지 못한다.

```
[ERROR] Tests run: 14, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 12.18 s <<< FAILURE! -- in com.ragchatbot.controller.AdminDocumentFlowTest
expected: 22L
 but was: 0L
[ERROR]   AdminDocumentFlowTest.list_row_carries_every_contract_field_from_its_own_source:126 
expected: 22L
 but was: 0L
[ERROR] Tests run: 14, Failures: 1, Errors: 0, Skipped: 0
[INFO] BUILD FAILURE

##### status -> 리터럴 in_progress
[ERROR] Tests run: 14, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 12.01 s <<< FAILURE! -- in com.ragchatbot.controller.AdminDocumentFlowTest
expected: "completed"
 but was: "in_progress"
[ERROR]   AdminDocumentFlowTest.list_row_carries_every_contract_field_from_its_own_source:128 
expected: "completed"
 but was: "in_progress"
[ERROR] Tests run: 14, Failures: 1, Errors: 0, Skipped: 0
[INFO] BUILD FAILURE

##### created_at -> u.created_at
[ERROR] Tests run: 14, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 12.23 s <<< FAILURE! -- in com.ragchatbot.controller.AdminDocumentFlowTest
expected: 2026-09-07T06:41:34.577434Z
 but was: 2026-09-07T06:41:34.560131Z
[ERROR]   AdminDocumentFlowTest.list_row_carries_every_contract_field_from_its_own_source:133 
expected: 2026-09-07T06:41:34.577434Z
 but was: 2026-09-07T06:41:34.560131Z
[ERROR] Tests run: 14, Failures: 1, Errors: 0, Skipped: 0
[INFO] BUILD FAILURE

##### 복구 후 무교란
[INFO] Tests run: 14, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 11.45 s -- in com.ragchatbot.controller.AdminDocumentFlowTest
[INFO] Tests run: 14, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS

[exited with code 0]
```

| 교란 | 걸린 단언 | 결과 |
|---|---|---|
| `byte_size` → `0` | `:126` byteSize | expected 22L / but was 0L |
| `status` → 리터럴 | `:128` status | expected "completed" / but was "in_progress" |
| `created_at` → `u.created_at` | `:133` createdAt | 17ms 차이로 갈림 |
| 교란 없음 | — | 14개 통과 |
