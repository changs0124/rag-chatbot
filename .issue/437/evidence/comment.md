## 작업 요약

다른 탭 · 기기에서 스트리밍 중인 대화를 지우면, 서버는 생성을 끝까지 한 뒤 답을 저장하다가 외래 키 위반으로 실패했습니다. 그러면 지운 대화에 대고 「응답 생성 중 오류」 이벤트를 보내고, 「처리되지 않은 예외」 ERROR 를 남겼습니다.

- `ChatService.stream` : 저장 등이 실패하면 먼저 대화가 아직 있는지 봅니다.
  - 없으면 INFO 한 줄(원래 예외 포함)만 남기고, 이벤트 없이 닫습니다.
  - 확인 자체가 실패하면 지금처럼 오류로 다룹니다. 진짜 오류를 숨기지 않기 위해서입니다.
- 범위 밖 : 삭제를 알아챈 시점에 생성을 멈추는 것(비용 절감)은 하지 못했습니다. 워커가 블로킹 read 중이라 끊을 수단이 없습니다(#76).

## 측정 비교

| 항목 | 변경 전(운영 d450e4a) | 변경 후 |
| --- | --- | --- |
| 첫 토큰 뒤 DELETE | 204 → 생성 33.6초 계속 → `error` 이벤트 · FK 위반 「처리되지 않은 예외」 | 테스트 : `error` 없음 · ERROR 없음 · INFO 「…답을 버림」 · 메시지 0행 |
| 모델 실패가 삭제와 겹침 | (같은 ERROR 경로) | 테스트 : `error` 없음 · INFO 줄에 원래 예외 메시지가 남음 |
| 대화가 있는데 생긴 진짜 오류 | `error` + ERROR | 그대로(기존 `ChatStreamExceptionHandlerTest` 통과) |

- 변경 전 원본 : `.issue/437/evidence/before/prod-repro.txt`. 재현 스크립트는 QA 폴더 `del437.py` 입니다.
- 변경 후 원본 : `after/test.txt` · `after/check-all.txt`. 새 테스트는 변경 전 코드에서 실패합니다(본문에 `event:error`).
- 배포 뒤 운영에서 같은 재현으로 다시 확인합니다.
- 화면 변화가 없는 서버 변경이라 캡처 대신 이벤트 · 로그 · 행 수를 남겼습니다. 화면에서 지울 때의 동작은 10-23 QA F9 에서 정상으로 확인했습니다.

## 변경 파일

- `backend/src/main/java/com/ragchatbot/service/ChatService.java` — `conversationGone` · 로거
- `backend/src/test/java/com/ragchatbot/controller/ChatConversationDeletedTest.java` — 2건
- `docs/02_architecture/backend.md` · `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env`(백엔드 353 → 355)

## 검증

- `scripts/check-all.sh` 통과 : 백엔드 355/355 · 프론트 210/210
- shellcheck · gitleaks · trivy 는 로컬에 없어 건너뛰었습니다. 이 셋은 CI 에서 돕니다
- #443(#436)과 하한 · CHANGELOG 가 겹칩니다. 함께 merge 할 때 정리합니다

## 리뷰(sonnet) 반영

- [MEDIUM] 「버림」 갈래에서 원래 예외가 사라졌습니다 → INFO 줄에 남깁니다
- [MEDIUM] 테스트가 정상 갈래 하나뿐이었습니다 → 모델 실패가 삭제와 겹치는 경우를 더했습니다
