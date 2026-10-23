## 작업 요약

200 응답 전에 중단하면, 끊은 뒤 그 대화의 이력을 서버에 물어 처리를 가른다.
- 질문이 저장돼 있지 않으면 : 보낸 글과 첨부 카드를 입력창에 되돌리고, 그 턴이 만든 빈 새 대화는 서버와 사이드바에서 지운다(10-23 결정)
- 질문이 이미 저장돼 있으면 : 질문을 그대로 보인다. 되돌리지도 지우지도 않는다

이렇게 가르는 이유는 서버가 질문 저장과 첨부 연결을 커밋한 뒤에 200 을 돌려주기 때문이다. 「200 없음」이 「저장 안 됨」을 뜻하지 않는다(opus 리뷰 HIGH 반영).

## 변경 전후

새 대화에서 보내고 1초 뒤 중단했다. 채팅 응답은 3초 지연되는 목업이다.

| 전 | 후 |
| --- | --- |
| ![중단 직후 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/440/evidence/before/early-abort.webp) | ![중단 직후 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/440/evidence/after/early-abort.webp) |

빨간 박스는 입력창과 대화 목록이다.
- 변경 전 : 입력창이 비었고, 「AL.2263 클레임 몇 건이야?」 빈 대화가 사이드바와 서버에 남았다
- 변경 후 : 입력창에 보낸 글이 돌아왔고, 빈 대화는 사라졌다

네트워크 기록([전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/440/evidence/before/early-abort.txt) · [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/440/evidence/after/early-abort.txt))을 보면, 변경 후에는 중단 직후 `GET …/messages` → `DELETE /api/conversations/new-1`(204) → `GET /api/conversations` 순으로 요청이 나간다. 기록의 `FAIL … ERR_ABORTED` 는 playwright 가 목업 204 응답을 기록하는 방식일 뿐 실제 실패가 아니다. 바로 위 줄 `RES 204` 가 브라우저가 받은 응답이다.

## 변경 파일

- `frontend/src/hooks/useChat.ts` — 200 전에 중단하면 이력을 물어 가른다(저장됨 / 없음 / 확인 실패). 확인이 끝날 때까지 다시 보내기는 거절한다. 대화를 옮겨 끊긴 경우는 글을 되돌리지 않는다
- `frontend/src/components/chat/Composer.tsx` — `giveBack` 추가
  - 되돌린 글은 그사이 쓴 글 앞에 잇는다
  - 카드는 파일에서 미리보기를 다시 만든다(서버 첨부 id 그대로)
  - 합쳐 5장을 넘으면 나중에 더한 카드를 걷고 안내한다
  - 언마운트된 뒤에 온 되돌리기는 무시한다
- `docs/02_architecture/frontend.md` 중단 절(남은 한계 포함) · `CHANGELOG.md` · `scripts/case-floors.env`(프론트 하한 210 → 219)

## 검증

- 테스트 : `useChat` 6건 · `Composer` 3건 추가. 200 뒤 중단 회귀 가드 1건을 빼고는 변경 전 코드에서 실패함을 확인했다
- `bash scripts/check-all.sh` 통과 : 백엔드 357 · 프론트 219([기록](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/440/evidence/after/check-all.txt)). shellcheck · gitleaks · trivy 는 로컬에 없어 돌리지 않았다
- 리뷰(opus) 2회 : 1차 REQUEST CHANGES(H1 · M1 · L1) → 반영 → 2차 COMMENT(머지 가능). 2차 LOW 2건(카드를 key 로 비교 · 안내 문구 구분)도 반영했다

## 남은 이슈

빈도는 낮다. 막으려면 서버에 「비었을 때만 지우기」가 필요해서 이번 범위에서는 문서에만 적었다.
- 확인 요청이 서버의 질문 저장보다 먼저 처리되면 「없음」으로 판정한다. 이때 되돌린 첨부는 이미 쓰인 상태라, 다시 보내면 400 또는 404 가 난다
- 기존 대화의 마지막 메시지가 같은 글이면(답이 아직 저장되지 않은 직전 턴) 「저장됨」으로 잘못 판정한다
- 「저장됨」 판정 직후 곧바로 다시 물으면 서버가 아직 답을 만드는 중이라 429 가 난다(사용자당 동시 스트림 1)
- 로그아웃으로 끊기면 토큰이 먼저 지워져서 빈 대화 삭제가 401 로 실패한다
