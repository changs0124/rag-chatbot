## #558 리포트 — 첨부 이미지 가장자리 3건

1. **보낸 말풍선 썸네일 15분 뒤 깨짐** — `MessageList` 의 `<img onError>` → `useChat.refreshAttachment(id)` 가 그 대화의 `getMessages` 를 한 번 받아 **첨부 URL 만** id 로 바꿔 끼운다(스트리밍 중인 답은 건드리지 않음). 첨부 id 마다 한 번만 시도하고, 받는 사이 대화를 옮겼으면 버린다. 업로드 응답과 이력이 같은 `AttachmentResponse`(첨부 행 id)를 써서 id 가 맞는다
2. **라이트박스가 다른 사진을 보여줌** — `giveBack` 이 카드를 되돌릴 때 라이트박스를 닫는다. key 로 여는 안은 `ImageLightbox` 가 index 를 안에 들고 있어 같은 어긋남이 남아 택하지 않았다
3. **Firefox 내려받기** — 서명 URL 경로도 blob 경로처럼 `<a>` 를 문서에 붙여 클릭 후 뗀다(실기기 확인 없이 적용 — 사용자 승인, 무해한 변경)

테스트 +5(useChat 2 · MessageList 1 · Composer 1 · ImageLightbox 1)
- before : 5건 모두 실패 — `.issue/558/evidence/before/test.txt`
- after : lint · 313 테스트 · build 통과 — `.issue/558/evidence/after/test.txt`

문서 : `frontend.md` 세 동작.
