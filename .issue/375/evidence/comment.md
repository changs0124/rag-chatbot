## 작업 리포트 — #375 진행 단계에 첨부 이미지 분석 · 참조 문서 확인

브랜치 `feat/375-stage-labels-image-sources` · 커밋 `3f5aa06`

### 결정 (사용자, 10-19)
- 사진 첨부 턴 : 새 단계를 만들지 않고 **분석 단계 문구만** 「질문·첨부 이미지 분석 중」 — 모델이 이미지를 보는 시점 신호가 없어 별도 단계는 「실제로 지난 경계에서만」 계약에 어긋난다
- 검색 결과가 **실제로 도착한 순간** 「참조 문서 확인 중 · <첫 자료명> 외 N건」(N=0 이면 「외」 생략, 결과 0건이면 단계 없음)

### 변경
- 새 단계 `reviewing`(`Stage.REVIEWING`) — `searching` 재발행 대신 새 키. 한 키에 「검색 시작(이름 없음)」 「결과 도착(이름 있음)」 두 뜻을 싣지 않으려고. 화면(`useChat.ts`)은 키와 무관하게 라벨을 큐에 넣어 **프론트 코드 변경 없음**(테스트로 확인)
- 라이브 : `response.output_item.done` 의 `file_search_call` 결과에서 자료명 수집(출처와 같은 `resultFilename` 규칙, 중복 제거, 새 이름이 생길 때만 재발행)
- `stageLabel(stage, sources, withImage)` — ChatService 는 첨부 유무 사실만 넘기고 문구는 구현이 정함. 목업도 같은 규칙(목업 전용 문구 유지, REQ-RAG-004)
- 문서 : api.md `stage` · requirements 용어 · backend.md 「조회 단계 라벨」 · live-integration.md(확인 절차 · 가정 G) · README · CHANGELOG. **하한 315 → 320 · 186 → 187**

### 라이브 이벤트 형태 실측 (가정 G)
운영 키 · 스토어로 스트림을 받아 확인(서버에서 실행, 키는 서버 밖으로 안 나감) — `file_search_call.completed` 뒤 · 첫 `output_text.delta` **앞**에 `response.output_item.done`(file_search_call, status=completed, results 20건, filename 두 종)이 온다. 구현 가정과 같다

### 증거 — 로컬 목업 모드, 1440x900, 단계 라벨에 박스

| | 변경 전 | 변경 후 |
| --- | --- | --- |
| 사진 첨부 질문 | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/375/evidence/before/stage-image.webp) | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/375/evidence/after/stage-image.webp) |
| 출처 붙는 질문 | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/375/evidence/before/stage-sources.webp) | ![](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/375/evidence/after/stage-sources.webp) |

관측한 단계 순서(50ms 간격 폴링, `before/stage-sequence.txt` · `after/stage-sequence.txt`)

| 경우 | 전 | 후 |
| --- | --- | --- |
| 사진 첨부 | 질문 분석 중(목업) → 목업 코퍼스 조회 중 → 답변 작성 중(목업) | **질문·첨부 이미지 분석 중(목업)** → 목업 코퍼스 조회 중 → 답변 작성 중(목업) |
| 출처 있음 | 질문 분석 중(목업) → 목업 코퍼스 조회 중 - 이용 정책 문서 · FAQ 문서 → 답변 작성 중(목업) | 질문 분석 중(목업) → 목업 코퍼스 조회 중 → **목업 자료 확인 중 · 이용 정책 문서 외 1건** → 답변 작성 중(목업) |

- 후 캡처의 사이드바에는 전 캡처 때 만든 대화가 보인다(같은 임시 DB 재사용). 단계 요소 · 박스 위치는 같다
- 테스트 : 새 테스트가 변경 전 코드에서 실패(목업 통합 3건 단언 실패, 라이브 단위는 새 enum · 시그니처로 컴파일 실패) → `before/red-tests.txt` / 후 전부 통과 → `after/green-tests.txt`
- `bash scripts/check-all.sh` exit 0 · 백엔드 320 / 320 · 프론트 187 / 187 → `after/check-all.txt`

### 남은 것
- **운영 반영은 백엔드 배포가 필요하다.** 배포 뒤 운영 화면에서 사진 질문 · 문서 질문의 단계 표시를 확인한다
