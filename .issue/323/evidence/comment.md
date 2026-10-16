## 작업 요약

전송 경합 두 가지를 고쳤다.
- 대화 이력을 불러오는 중에 보내면, 이력이 도착하면서 방금 보낸 질문과 스트리밍 답을 덮어써 사라졌다(F1)
- 새 대화를 만드는 왕복 중의 두 번째 전송은 무시되는데, 입력창은 그래도 글과 첨부를 비워 버렸다(F2)

이제 `send` 는 받아들였는지를 바로 돌려주고, 입력창은 받아들여졌을 때만 비운다. 대기 중에는 보내기 버튼을 막고 그 이유를 버튼에 적는다(#101).

## 검증

| 항목 | 전 | 후 |
| --- | ---: | ---: |
| 막힘 회귀 테스트 4건 | 4건 실패 | **통과** |
| 해제 경로 테스트 2건(로딩 성공 · 로딩 실패) | — | **통과**(해제 코드를 지우면 실패함을 확인) |
| 프론트 전체 테스트(main #324 포함) | 162 | **168 통과** |
| lint · build · `check-all.sh docs` | — | 통과 |

- 리뷰 : 처음에는 REQUEST_CHANGES 였다(대기 중 버튼에 이유 없음, #101). 반영한 뒤 위 수치로 다시 검증했다
- 원본 : `.issue/323/evidence/` (before/after 테스트 출력)

## 변경 파일

- `frontend/src/hooks/useChat.ts` : 로딩 가드, 동기 `boolean` 반환, `creating` 상태 노출
- `frontend/src/components/chat/Composer.tsx` : 받아들였을 때만 비움, `busy` 가드와 버튼 이유
- `frontend/src/pages/ChatPage.tsx` : `busy` 전달
- 테스트 3개 파일. 기존 Composer 테스트는 `onSend` 가 `boolean` 을 돌려주도록 바뀐 타입에 맞췄다
- `docs/02_architecture/frontend.md` · `docs/01_specs/features.md` · CHANGELOG
- `scripts/case-floors.env` : 프론트 하한 162 → 168(실측)

## 남은 이슈

- 리뷰가 범위 밖으로 남긴 것 : 대화 생성 요청 자체가 실패하면 입력이 여전히 비워진다. 같은 계열의 기존 동작이라 별도 이슈 후보로 둔다
