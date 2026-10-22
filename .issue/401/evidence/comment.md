## 작업 요약
채팅 1건에 붙이는 첨부를 **5장**(`CHAT_MAX_ATTACHMENTS`, 중복 id 를 접은 뒤)으로 묶었다. 넘으면 `ChatService.prepare` 가 사용자 메시지 저장 · 모델 호출 **전에** 400 으로 거절한다.
입력창도 남은 자리만큼만 받고, 넘친 파일은 올리지 않고 「첨부는 한 번에 5장까지」를 알린다.
compose `JAVA_TOOL_OPTIONS` 에 `-XX:+ExitOnOutOfMemoryError` 를 더해, OOM 이 나도 JVM 이 반쯤 고장 난 채 남지 않고 `restart: unless-stopped` 로 회복하게 했다.

## 변경 전후
| 상황 | 전 | 후 |
| --- | --- | --- |
| 첨부 6장 전송 | 200, 6장 전부 base64 로 모델 요청에 실림 | **400** `첨부는 한 번에 5장까지 보낼 수 있음`, 메시지 0행 |
| 첨부 5장 + 같은 id 중복 1 | 200 | 200 (중복을 접고 5장) |
| 입력창에 6장 선택 | 6장 모두 업로드 | **5장만** 업로드 + 안내, 미리보기 URL 도 5개만 |
| 카드 하나 지움 | — | 안내가 걷히고 다시 1장 추가 가능 |
| 최악 힙(요청 1건) | 장수 × 약 13.3MB, 상한 없음 | **약 67MB** |

화면 캡처는 생략했다. UI 변화가 안내 문구 한 줄이고 `Composer.test.tsx` 가 문구와 업로드 수를 단언한다(#371 과 같은 방식).

## 검증
- 변경 전 실패 : `before/red-tests.txt` — 백엔드 `attachments_over_limit_400_before_save` (200 ≠ 400), 프론트 #401 2건(업로드 6회 ≠ 5회)
- 변경 후 통과 : `after/green-tests.txt`
- `bash scripts/check-all.sh` 통과 : `after/check-all.txt` — **백엔드 321 / 하한 321 · 프론트 193 / 하한 193**
- env 대조(`application.yml` ↔ `backend/.env.example`) 누락 0

## 변경 파일
- `backend/.../service/ChatService.java` · `application.yml` · `backend/.env.example`
- `frontend/src/components/chat/Composer.tsx`
- `docker-compose.yml`
- `docs/01_specs/api.md`(v1.6) · `features.md`(v2.6) · `docs/02_architecture/backend.md` 「유량 제어」 · `CHANGELOG.md` · `scripts/case-floors.env`
- 테스트 : `ChatFlowTest` +2 · `Composer.test.tsx` +2 · 생성자 인자 3곳

## 남은 이슈
- 사용자별 저장 쿼터는 범위 밖이다. 이 상한은 디스크가 쌓이는 속도만 줄인다
- 업로드 쪽 힙 적재는 #402 에서 다룬다
- 운영 반영에는 백엔드 재배포가 필요하다(compose 옵션 포함)
