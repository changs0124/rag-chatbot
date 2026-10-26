## 작업 요약

답 본문에 검색 결과 파일 이름이 확장자 · 문서 코드째 나오던 것을, 화면 · 저장본으로 나가기 전에 서버 필터가 짧은 문서 이름으로 바꾸게 했다.
- `TM매뉴얼_VSVDTMNOPK10_v3.md` · `TM매뉴얼_VSVDTMNOPK10_v3` → **TM매뉴얼**, `필드클레임현황.md` → **필드클레임현황**
- 규칙 : 검색 결과 이름과 **같은 글자만** 바꾼다. 확장자를 빼고 첫 `_` 앞까지 남긴다. 사용자가 쓴 다른 글자와 출처 목록(`sourceName`)은 그대로다
- 이름이 스트림 조각 사이에서 잘려 오면 다음 조각까지 붙잡는다(정지로 끊긴 답은 그 꼬리가 저장본에 남지 않는다 — 이름 길이 미만)
- #429 에서 필터가 명사 자리에 넣는 문서 이름도 같은 규칙을 따른다 → 이슈의 「필터 삽입 이름」 완료 기준은 이렇게 정했다

**지시문은 바꾸지 않았다.** 처음에는 지시문에 「파일 이름 대신 짧은 이름으로 부른다」 줄을 넣어 쟀다. 노출은 0 이 됐지만, 근거로 답하고도 인용을 하나도 달지 않는 답이 늘었다. 그런 답은 화면에 「자료 없음」으로 뜬다. 그래서 사용자 결정으로 필터 쪽으로 바꿨다.

## 실측

| 묶음 | 지표 | 변경 전 | 지시문 1안 | 지시문 2안(인용 유지 문장 추가) |
|---|---|---|---|---|
| 압박 턴 | 파일 이름 노출 | 9/24 | 0/24 | 0/16 |
| 배터리 31문항 | 파일 이름 노출 | 13/124 | 0/62 | 0/124 |
| 배터리 31문항 | 기대 출처 모두 인용 | 122/124 | 57/62 | 117/124 |
| 배터리 31문항 | 근거로 답했는데 인용 0건 | 1/124 | 3/62 | **5/124** |

운영 서버에서 OpenAI 를 직접 호출해 쟀다(지시문은 javac 로 뽑은 배포될 실제 문자열). 1안의 배터리 · 압박 원자료는 2안 측정에 덮어써져 남지 않았다. 수치는 당시 채점 출력이다.

**필터(최종안) 검증 — OpenAI 호출 없음**
- 오늘 측정의 실제 답 1,260개를 1~8글자 무작위 조각으로 잘라 필터에 5번씩 흘렸다 : 파일 이름이 든 답 37개 · 실행 6,300회 · **기대와 다른 출력 0 · 남은 파일 이름 0**
- 처음 판은 4회 어긋났다. 「…_v3.」 | 「md」 처럼 확장자 점 바로 뒤에서 잘리면 앞부분만 먼저 바뀌어 「.md」 가 남았다. 고친 뒤 0 이고, 같은 경우를 테스트로 고정했다
- `SourceNameRewriterTest` 10개 · 기존 `CitationMarkupFilterTest` 16개 그대로 통과 · check-all 백엔드 376/376 · 프론트 222/222

원본 기록 : [변경 전 노출](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/470/evidence/before/exposure.txt) · [지시문 시도](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/470/evidence/after/instruction-attempt.txt) · [재생 검증](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/470/evidence/after/replay.txt) · [check-all](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/470/evidence/after/check-all.txt)

답 원문은 고객 가명이 들어 있어 저장소 밖 QA 폴더(`results/2026-10-26-470/`)에 두었다. 변경 전 기록은 파일을 고치기 전에 main 문자열로 잰 값이다.

## 변경 파일

- `backend/src/main/java/com/ragchatbot/openai/SourceNameRewriter.java` — 새 파일, 이름 치환 · 조각 경계 보류
- `backend/src/main/java/com/ragchatbot/openai/CitationMarkupFilter.java` — 내보내는 글자를 치환기에 통과, 검색 결과 이름 전달, `flush` 에 꼬리 포함
- `backend/src/test/java/com/ragchatbot/openai/SourceNameRewriterTest.java` — 10개
- `docs/01_specs/live-integration.md` 3-1 · `docs/02_architecture/backend.md` — 규칙과 지시문을 뺀 이유
- `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env` — 하한 백엔드 366 → 376

## 남은 것

- **백엔드 배포가 필요하다**(프론트 변경 없음). 운영 앱 경로 확인은 배포 뒤에 한다
- 브랜치 `fix/470-no-filename-in-answer` · 커밋 `c7f5120`
