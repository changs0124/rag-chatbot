## 작업 요약

보내기와 중단 버튼이 같은 자리에 있어서, 보내기를 약 300ms 간격으로 두 번 누르면 두 번째 탭이 방금 나타난 중단 버튼을 눌렀습니다. 두 가지를 고쳤습니다.

- `Composer` : 중단 버튼이 나타난 뒤 **500ms**(OS 기본 더블클릭 간격) 안의 클릭은 무시합니다. 그보다 뒤의 중단은 지금처럼 바로 동작합니다.
- `useChat` : 서버 이벤트를 하나도 받기 전에 끊긴 턴은 **질문 말풍선도 걷습니다**. 요청이 서버 검증 전에 끊기면 질문도 저장되지 않으므로, 이렇게 해야 화면과 새로고침 결과가 같아집니다. 서버가 단계를 보낸 뒤의 중단은 지금처럼 질문과 받은 데까지를 남깁니다.

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
- `frontend/src/hooks/useChat.ts` — 첫 서버 이벤트 전 중단이면 질문 말풍선도 제거
- 테스트 : `Composer.test.tsx` 1건 · `useChat.test.ts` 1건 추가(둘 다 변경 전 실패 확인). 기존 「받은 것 없이 중단」 테스트는 서버가 단계를 보낸 뒤의 중단으로 좁혔습니다
- `docs/02_architecture/frontend.md` 「스트리밍 UI 규칙」 · `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env`(프론트 하한 206 → 208)

## 검증

- `scripts/check-all.sh` 통과(`after/check-all.txt`) : 프론트 208/208 · 백엔드 348/348
- shellcheck · gitleaks · trivy 는 로컬에 없어 건너뛰었습니다. 이 셋은 CI 에서 돕니다
