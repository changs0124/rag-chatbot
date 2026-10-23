## 작업 요약

클라이언트가 SSE 를 끊으면(중단 버튼 · 화면 이동) 컨테이너가 `AsyncRequestNotUsableException`(Broken pipe)을 넘깁니다. 이 예외를 받는 처리기가 없어서, 최종 폴백이 받아 「처리되지 않은 예외」 ERROR 와 스택을 남겼습니다. #326 의 타임아웃과 같은 모양이라 같은 자리에 처리기를 하나 더했습니다.

- `GlobalExceptionHandler.handleClientGone` : DEBUG 한 줄(원인 메시지 포함)만 남기고 아무것도 쓰지 않습니다(null = 처리 완료).
- 중단분 저장(`stopped=true`)은 `ChatService` 의 `ClientGoneException` 경로가 따로 하므로 그대로입니다.

이슈 본문에는 「끊길 때마다 늘 나오지는 않는다」고 적었는데, 정정합니다. 운영에서 끊기를 5번 다시 해 보니 5번 모두 ERROR 가 났습니다.

## 측정 비교

| 항목 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 운영 끊기 5회(토큰 3~6개 뒤) | 「처리되지 않은 예외」 **5건** · 스택 330줄 | 배포 뒤 같은 재현으로 확인 예정 |
| `ClientGoneLoggingTest`(실 톰캣) | FAIL — 로그에 「처리되지 않은 예외」 | PASS — 본문 없음 · ERROR 없음 |
| 중단분 저장 | `stopped=true` 저장(정상) | 그대로 |

- 변경 전 원본 : `.issue/436/evidence/before/prod-log.txt`. 재현 스크립트는 QA 폴더 `abort436.py` 이고, 시험 대화는 끝난 뒤 지웠습니다.
- 변경 후 원본 : `after/test.txt` · `after/check-all.txt`
- 화면 변화가 없는 서버 로그 변경이라 캡처 대신 로그 수와 테스트 결과를 남겼습니다.

## 변경 파일

- `backend/src/main/java/com/ragchatbot/exception/GlobalExceptionHandler.java` — `handleClientGone`
- `backend/src/test/java/com/ragchatbot/exception/ClientGoneLoggingTest.java` — 2건 : 처리기 경로(변경 전 실패 확인), 처리기 직접 호출
- `docs/02_architecture/backend.md` 예외 표 · `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env`(백엔드 353 → 355)

## 검증

- `scripts/check-all.sh` 통과 : 백엔드 355/355 · 프론트 210/210. 다른 예외가 여전히 ERROR 로 남는 것은 기존 `GlobalExceptionFallbackTest` · `ChatStreamExceptionHandlerTest` 가 지킵니다
- shellcheck · gitleaks · trivy 는 로컬에 없어 건너뛰었습니다. 이 셋은 CI 에서 돕니다

## 리뷰(sonnet) 반영

- [MEDIUM] 테스트가 「로그에 없다」만 봤습니다 → 전용 처리기가 받았다는 증거(200 · 본문 없음, 폴백이면 500)와 직접 호출 테스트를 더했습니다. 실제 끊김이 오는 비동기 디스패치 경로는 테스트로 재현하기 어려워, 배포 뒤 운영 재현으로 확인합니다
- [LOW] 같은 예외가 「이미 끝난 비동기 응답에 쓰기」에서도 난다는 점과 그 경우도 DEBUG 로 내려간다는 점을 Javadoc 에 적었습니다. 지금 비동기 응답은 채팅 SSE 하나입니다
