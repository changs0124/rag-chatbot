## 작업 요약

새 대화가 200 전에 끊겼을 때 대화를 지우는 방식을 바꿨다.
- 전 : 화면이 이력을 확인한 뒤 조건 없이 지웠다
- 후 : 서버의 **「비었을 때만 지우기」** 한 번으로 가른다

서버는 대화 행을 잠근 상태에서 메시지가 있는지 보고, 있으면 409 를 돌려준다. 채팅 준비도 같은 행을 잠그므로 확인과 삭제 사이에 저장이 끼어들 틈이 없다. 이로써 #440 merge 때 받아들였던 데이터 손실 경로(남은 한계 ①)를 막았다.

## 변경 전후 (실 PostgreSQL 통합 테스트)

| 경우 | 전 | 후 |
| --- | --- | --- |
| 메시지가 있는 대화에 `?ifEmpty=true` | 204 · **질문 · 대화 삭제** | **409** · 남음 |
| 채팅 준비가 질문을 넣고 커밋하기 전에 삭제 | 잠금 대기 → 커밋 뒤 204 · **막 저장된 질문 삭제** | 잠금 대기 → 커밋 뒤 **409** · 질문 남음 |
| 삭제가 먼저 행을 잠근 사이에 채팅 도착 | (준비가 잠그지 않으면) **500** 외래 키 위반 | 대기 → 삭제 커밋 뒤 **404** · 저장 0 |
| 빈 대화 · 남의 대화 · 지운 뒤의 채팅 | — | 204 · 404 · 404 |

- 잠금 대기는 고정 sleep 이 아니라 `pg_stat_activity` 로 확인했다
- 원본 기록 : [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/447/evidence/before/delete-if-empty-test.txt) · [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/447/evidence/after/delete-if-empty-test.txt)
- 화면 캡처는 남기지 않았다. 바뀐 것은 서버 판정과 경합 처리이고, 화면에서 보이는 동작은 #440 증거와 같다(204 경로)

## 변경 파일

- 백엔드
  - `ConversationController` — `DELETE /{id}?ifEmpty=true`
  - `ConversationService.deleteIfEmpty` — `FOR UPDATE` 잠금 → 메시지가 있으면 409 → 없으면 삭제(READ COMMITTED 명시)
  - `requireOwnedLocked` — `FOR KEY SHARE`. `ChatService.prepare` 가 이것을 쓴다
  - 매퍼 3개 쿼리
- 프론트
  - `endpoints.deleteConversationIfEmpty`
  - `useChat` — 새 대화의 200 전 중단을 조건부 삭제로 가른다
    - 204 · 404 → 글을 되돌리고 새 대화 상태로 돌아간다
    - 409 → 이력을 보인다. 이력을 못 받으면 질문 말풍선을 되살린다
    - 그 밖의 실패 → 글만 되돌린다
  - 기존 대화는 지금처럼 이력으로 가른다
- 문서 : `api.md` API-DELETE-001 절 · `backend.md` 잠금 · `frontend.md` 중단 절 · CHANGELOG · 하한(백엔드 358 → 364 · 프론트 219 → 222)

## 검증

- `bash scripts/check-all.sh` 통과 : 백엔드 364 · 프론트 222([기록](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/447/evidence/after/check-all.txt)). shellcheck · gitleaks · trivy 는 로컬에 없어 CI 에서 돈다
- 변경 전 코드에서 실패하는 것을 확인했다
  - 백엔드 2건 : 메시지 있음 · 커밋 전 경합
  - 반대 순서 경합 : 준비 잠금을 빼면 500
  - 프론트 4건
- 리뷰(opus) : COMMENT(머지 가능). 잠금 순서 · 원자성 · 데드락 · 트랜잭션 프록시 · 매핑은 정적 검토에서 이상 없음. 지적은 모두 반영했다
  - 반대 순서 경합 테스트 추가
  - sleep 을 `pg_stat_activity` 확인으로 교체
  - 409 인데 이력을 못 받으면 질문 말풍선을 되살림
  - 404 는 지운 것과 같게 처리
  - READ COMMITTED 명시 · 주석 정정

## 남은 이슈

10-23 결정으로 범위 밖에 둔 것들이다. 막으려면 전송 식별자가 필요하다(`frontend.md`).
- 기존 대화에서 확인 요청이 서버의 질문 저장보다 먼저 처리되면, 되돌린 첨부를 다시 보낼 때 400 이 난다
- 기존 대화의 마지막 메시지가 같은 글이면 저장됐다고 오판한다
