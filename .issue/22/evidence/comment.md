## 최종 리포트

`#21` 이 `backend.md` 「레이어」에 넣은 불릿이 **코드에 없는 패턴을 불변식으로** 적었다. 그것을 고치고 `CHANGELOG [Unreleased]` 에 #19 · #21 을 채웠다.

문서만 바뀌므로 스크린샷 대신 **전수 대조**를 증거로 남긴다. 줄 번호와 회차 계수는 싣지 않는다 — 다음 커밋에 낡는다.

### 무엇이 거짓이었나

> 등록·**수정·삭제는 반드시 `entity` 를 경유한다.** 비즈니스 규칙이 엔티티 쪽에 있으므로

두 주장 다 거짓이었다. 수정·삭제 **13건**이 전부 스칼라·컬렉션 파라미터를 받고, `entity/` record 6개는 **전부 메서드가 0개**다.

### 최종 문장

```
- **조회 전용 매핑은 예외다.** 조인 결과를 그대로 돌려주는 목록 조회는 `repository` 가 `dto` 의
  Response 를 **직접** 매핑할 수 있다. MyBatis 는 JPA 와 달리 `resultMap` 에 임의 타입을 지정할 수 있어
  중간 엔티티가 필요 없다. 현재 그렇게 하는 것은 `RagDocumentRepository.listAlive()` 한 건이다 —
  `AdminDtos.DocumentResponse` 를 바로 돌려주며, 중첩 record 이므로 XML 에는 바이너리명
  `com.ragchatbot.dto.AdminDtos$DocumentResponse` 로 쓴다.
- **그 대가로 SQL 이 응답 스펙에 직결된다.** 해당 엔드포인트의 응답 필드를 바꾸려면 XML 도 함께 고쳐야 한다.
  같은 모양의 타입을 하나 더 두고 서비스에서 옮겨 담는 편이 나아 보일 수 있으나, 그 변환은 필드 복사일 뿐이라
  실수할 자리만 늘린다.
- **이 예외는 조회에만 적용된다.** 쓰기 경로(mapper XML 기준 `<insert>` 6 · `<update>` 10 · `<delete>` 3.
  소프트 삭제는 `<update>` 로 센다)는 `dto` 를 매핑하지 않는다. **`entity` 를 통째로 받는 것은 등록
  6건뿐이고**, **수정·삭제 13건은 전부 식별자·값 스칼라 또는 이메일 `List` 를 받는다.**
```

「규칙의 자리는 `entity/` 가 아니다」 불릿은 **통째로 삭제했다.** 논증이 성립하지 않았고 — 「메서드가 없다」가 지우는 것은 *규칙 집행*이라는 이유 하나뿐이다 — 규칙의 실제 배치는 같은 문서의 레이어 표와 업로드 검증 절이 이미 정확하게 적고 있다.

### 전수 검증

```
주장> <insert> 6 · <update> 10 · <delete> 3 (소프트 삭제는 <update>)
검증> 6 · 10 · 3.  <update id="softDelete"> 실재.  grep -c 로 기계 재현 가능

주장> 쓰기 경로는 dto 를 매핑하지 않는다
검증> XML 전체에서 com.ragchatbot.dto 등장 = 1건, 그것을 쓰는 것은 <select id="listAlive"> 뿐
검증> XML 밖 쓰기 경로 = 0건
      (@Insert/@Update/@Delete · JdbcTemplate · SqlSession · EntityManager 전부 0)

주장> entity 를 통째로 받는 것은 등록 6건뿐
검증> insert(Attachment) · insert(Citation) · insert(Conversation)
      insert(Message) · insert(RagDocument) · insert(User)
      insert 외에 entity 파라미터를 받는 메서드 = 0건

주장> 수정·삭제 13건은 전부 식별자·값 스칼라 또는 이메일 List 를 받는다
검증> update+delete = 13건
      파라미터 타입 전수 = UUID · String · OffsetDateTime · List<String>

주장> 조인 결과를 그대로 돌려주는 목록 조회는 listAlive() 한 건
검증> 저장소의 조인 3건 중
        listAlive          u.name as uploaded_by_name 을 결과에 싣는다 -> dto 직접 매핑
        findByConversation 조인을 필터로만 쓴다               -> entity 매핑
        (citation)         같음                                -> entity 매핑
```

```
$ sh scripts/check-doc-refs.sh
참조 수집 181건 · 실재 검사 179건
문서 참조 검사 통과
```

### 여섯 번 고쳤다

같은 문단이 여섯 번 block 됐고, **여섯 번 다 핵심 명제가 아니라 그 뒤에 붙인 분해·귀속절**에서 틀렸다.

| 틀린 자리 | 판정 |
|---|---|
| 「규칙이 `entity` 에 있다」 | 거짓 |
| 「규칙은 `service` 에 있다」 | 과잉 일반화 — `config` · `dto` 에도 있음 |
| 「권한은 `service`, 검증은 `dto`」 | 거짓 — 권한은 네 곳으로 갈림 |
| 「**10건**은 식별자와 바뀔 값을 스칼라로」 | 거짓 — 그중 3건이 삭제문이라 「바뀔 값」이 없음 |
| `(insert(RagDocument))` 괄호 | 전수 주장에 붙은 예시 — 6건 중 1건의 시그니처 |
| 「조인이 섞인 목록·**통계** 조회」 | 반례 실재 · 「통계」는 원소 0건 |
| CHANGELOG 「자리가 **세 곳**」 | 실제로 다섯 곳을 열거 |
| CHANGELOG 「표준에 없는 … `service`」 | `service` 는 표준 어휘 |
| CHANGELOG 「다섯 곳 전부 `BindingException`」 | 다섯 중 `namespace` 하나만 그렇게 터진다 |
| CHANGELOG 「`config`·`security` 를 건드리지 않았다」 | 둘 다 실제로 바뀌었다 |

**매번 검증한 명제보다 강한 명제를 적었다.** 그리고 곁가지를 지운 자리에 같은 성격의 새 곁가지를 넣기를 반복했다.

구조적으로 바뀐 지점이 하나 있다. 앞선 오류는 전부 grep 으로 결판나지 않는 술어(「규칙이 어디 있는가」 · 「바뀔 값이 무엇인가」)에 있었다. 최종 문장은 그 술어를 버리고 **파라미터 타입 집합**과 **XML 태그 수**라는 기계 판정 가능한 것으로 바꿨고, 그래서 처음으로 전수 참이 됐다.

마지막 라운드에서는 **고치는 대신 지웠다.** CHANGELOG 의 곁가지 세 절과 이 리포트의 줄 번호·회차 서사를 삭제했다. 여섯 번 고쳐 일곱 번째가 오는 것보다, 논증에 기여하지 않는 절을 없애는 편이 낫다.

### 남은 위험

`6 · 10 · 3 · 13` 을 지킬 **CI 가드가 없다.** 누가 `<update>` 하나를 추가하면 이 문장은 CI 한 줄 안 깨고 조용히 거짓이 된다. `scripts/check-doc-refs.sh` 는 참조 실재만 검사하고, 클래스·메서드 이름과 불변식 문장은 어떤 정적 검사로도 안 잡힌다. 여섯 번의 거짓이 전부 사람 눈으로만 잡힌 배경이다.

### 범위 밖으로 넘긴 것

`backend.md` 의 또 다른 거짓 불변식(「상태 코드를 컨트롤러가 만들지 않는다 … 삭제류만 `noContent()`」)은 원인이 #23 과 같아 [그쪽에 넘겼다](https://github.com/changs0124/rag-chatbot/issues/23#issuecomment-5564172789).
