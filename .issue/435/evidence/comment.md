## 작업 요약

보내기와 중단 버튼이 같은 자리에 있어서, 보내기를 약 300ms 간격으로 두 번 누르면 두 번째 탭이 방금 나타난 중단 버튼을 눌렀습니다. 두 가지를 고쳤습니다.

- `Composer` : 중단 버튼이 나타난 뒤 **500ms**(OS 기본 더블클릭 간격) 안의 클릭은 무시합니다. 그보다 뒤의 중단은 지금처럼 바로 동작합니다.
- `useChat` : **200 응답을 받기 전에** 끊긴 턴은 질문 말풍선도 걷습니다. 서버는 질문을 저장한 뒤에 200 을 돌려주므로, 그 전에 끊긴 요청은 서버에 닿지 않았을 수 있습니다. 이렇게 해야 화면과 새로고침 결과가 같아집니다. 200 을 받은 뒤의 중단은 지금처럼 질문과 받은 데까지를 남깁니다. 200 을 받은 시점은 `streamChat` 이 새로 부르는 `onOpen` 으로 알립니다.

## 전후 비교

같은 장치에서 찍었습니다. 워크트리 빌드를 로컬 `vite preview` 로 띄우고, playwright 로 API 를 목업으로 가로챘습니다(채팅 응답은 1.5초 지연). 보내기 버튼 중앙을 **300ms 간격으로 두 번** 클릭했고, 화면은 1440x900 입니다.
박스는 메시지 영역과 보내기 · 중단 버튼을 가리킵니다.

| 변경 전 | 변경 후 |
| --- | --- |
| ![before](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/435/evidence/before/double-tap.webp) | ![after](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/435/evidence/after/double-tap.webp) |
| 두 번째 클릭에 `POST /api/chat` 이 `net::ERR_ABORTED` 로 끊김. 질문만 남고 답이 없음 | 두 번째 클릭은 무시되고 답이 끝까지 나옴 |

- 네트워크 기록은 `.issue/435/evidence/before/double-tap.txt` · `after/double-tap.txt` 에 있습니다.
- 운영 재현 기록은 `before/prod-repro.txt` 에 있습니다. 운영에서도 `POST /api/chat` 직후 `ERR_ABORTED` 가 났고, 서버에 저장된 메시지는 0개였으며 빈 대화가 남았습니다. 같은 화면에서 한 번 클릭 · Enter 두 번 · `dblclick` 은 정상이었습니다.

## 변경 파일

- `frontend/src/components/chat/Composer.tsx` — 중단 클릭 무시 시간
- `frontend/src/hooks/useChat.ts` — 200 을 받기 전 중단이면 질문 말풍선도 제거
- `frontend/src/lib/endpoints.ts` — `streamChat` 이 200 에서 `onOpen` 을 부름
- 테스트 : `Composer.test.tsx` · `useChat.test.ts` · `stream.test.ts` 각 1건 추가(앞 둘은 변경 전 실패 확인). `useChat` 테스트 목업은 실제처럼 스트림이 열릴 때 `onOpen` 을 부릅니다
- `docs/02_architecture/frontend.md` 「스트리밍 UI 규칙」 · `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env`(프론트 하한 206 → 209)

## 검증

- `scripts/check-all.sh` 통과(`after/check-all.txt`) : 프론트 209/209 · 백엔드 348/348
- shellcheck · gitleaks · trivy 는 로컬에 없어 건너뛰었습니다. 이 셋은 CI 에서 돕니다

## 리뷰 반영 (opus 코드 리뷰)

- [HIGH] 처음에는 첫 단계 · 토큰 이벤트를 받았는지로 질문 말풍선 제거를 정했습니다. 리뷰에서 「서버는 200 전에 질문을 저장하므로, 200 뒤 단계 이벤트 전의 중단에서는 저장된 질문을 지운다」는 지적이 나와, 기준을 200 응답(`onOpen`)으로 바꿨습니다
- [LOW] 중단 버튼이 나타난 시각을 `useEffect` 대신 `useLayoutEffect` 에서 적습니다. 그래서 첫 프레임의 클릭도 막힙니다
- 남은 한계 : 200 을 받기 전 중단(가드 500ms 뒤에도 응답이 늦는 경우)에서 새 대화였다면 빈 대화가 사이드바에 남고, 입력한 글은 입력창으로 돌아오지 않습니다. 가드 뒤에는 드물어 이번 범위에서는 다루지 않았습니다
