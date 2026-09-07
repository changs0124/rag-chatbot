## 수정 완료

문서만 바뀌므로 스크린샷 대신 **주장별 코드 대조**를 증거로 남긴다.

### 무엇이 거짓이었나

`backend.md` 세 번째 불릿:

> 등록·**수정·삭제는 반드시 `entity` 를 경유한다.** 비즈니스 규칙이 엔티티 쪽에 있으므로 이 예외는 조회에만 적용된다.

두 주장이 모두 거짓이었다.

**주장 A — 수정·삭제가 entity 를 경유한다** → repository 의 update/delete 계열 **11개가 전부 스칼라 파라미터**를 받는다.

```
ConversationRepository  deleteByIdAndUser(id, userId) · updateTitle(id, userId, title)
RagDocumentRepository   updateStatus(id, status) · softDelete(id, deletedAt)
UserRepository          updateName · updatePasswordHash · updateTheme · demoteAdminsNotIn · promoteAdmins
AttachmentRepository    deleteByIdAndUser(id, userId) · deleteById(id)
```

entity 를 받는 것은 `insert` 6개뿐이다.

**주장 B — 비즈니스 규칙이 엔티티 쪽에 있다** → `entity/` record 6개가 **전부 메서드 0개**다.

```
Attachment 0 · Citation 0 · Conversation 0 · Message 0 · RagDocument 0 · User 0
```

같은 문서 `:11`(`service/ 오케스트레이션 · 트랜잭션 경계`)·`:14`(`entity/ DB 행에 대응하는 record`)와 **정면으로 모순**된다.

### 고친 문장

```
- **이 예외는 조회에만 적용된다.** 쓰기 경로는 `dto` 를 매핑하지 않는다. 등록은 `entity` 를 통째로 받고
  (`insert(RagDocument)`), 수정·삭제는 식별자와 바뀔 값만 스칼라 파라미터로 받는다
  (`updateStatus(id, status)` · `softDelete(id, deletedAt)`). `entity/` 의 record 는 값을 담기만 하고
  규칙은 `service/` 에 있으므로, 수정·삭제까지 굳이 entity 를 거칠 이유가 없다.
```

예외 확대를 막는 첫 문장("이 예외는 조회에만 적용된다")은 참이므로 살렸고, 그 뒤를 **관측된 실제 패턴**으로 바꿨다.

**고친 문장이 코드에서 참인지 다시 grep 으로 대조했다.** 이번 오류의 원인이 "확인 없이 적은 것" 이므로 이 단계를 생략하지 않았다.

### 왜 생겼나

볼트 노트의 일반 원칙("실무 기준선 — 등록·수정·삭제는 반드시 Entity 경유")을 **코드로 확인하지 않고 이 저장소의 불변식으로 옮겨 적었다.** 일반적으로 권장되는 설계와, 이 저장소가 실제로 하고 있는 것은 다른 이야기다.

**CI 가 못 잡은 이유** : `scripts/check-doc-refs.sh` 는 **파일 경로만** 검사한다. 클래스·메서드 이름과 불변식 문장은 어떤 정적 검사로도 안 잡힌다. `#21` 은 파일 경로를 하나도 안 바꿨으므로 이 게이트가 구조적으로 볼 수 없는 변경이었다.

### CHANGELOG

`[Unreleased] ### Changed` 에 #19 · #21 을 추가했다. 그 절은 훨씬 작은 변경(선행 조회 제거, 카운터 필드 삭제)까지 적고 있는데 71파일 리네이밍과 계층 예외 최초 도입이 빠져 있었다.

`#21` 항목에는 **삭제된 타입명 `RagDocumentSummary` 를 남겼다** — 옛 문서나 이슈에서 그 이름을 만난 사람이 "왜 없어졌는지" 를 찾을 자리가 된다. 기각한 대안(같은 모양 타입 하나 더 두기)도 함께 적었다.

### 검증

```
$ sh scripts/check-doc-refs.sh
참조 수집 181건 · 실재 검사 179건
문서 참조 검사 통과
```

```
2 files changed, 30 insertions(+), 2 deletions(-)
```

문서만 바뀌므로 `./mvnw` 는 돌리지 않았다.
