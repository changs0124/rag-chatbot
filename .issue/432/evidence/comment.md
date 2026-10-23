## 작업 요약

[제품 결정](https://github.com/changs0124/rag-chatbot/issues/432#issuecomment-6357097977)대로 서비스 번호 · S/N 을 **기본으로 넣게** 했습니다.
지시문(`RAG_INSTRUCTIONS`)에 줄 하나를 더했습니다. 클레임을 건별로 나열하거나 표로 정리할 때는 클레임 번호와 함께 검색 결과에 있는 서비스 번호 · S/N 을 넣고, 검색 결과에 없는 번호는 만들지 않습니다.

## 측정 비교

운영 서버에서 운영 키 · 스토어 · gpt-6-sol 로 OpenAI 를 직접 호출했습니다. 지시문은 배포될 Java 문자열을 javac 로 뽑아 썼습니다.
10-22 헤비 세션(SA · SB)에 **기록된 답을 이력으로** 넣었습니다. 이력은 앱과 같은 방식(최근부터, 문자 1.5개당 1토큰, 예산 6000)으로 잘랐고, 대상 턴만 4회씩 물었습니다.
식별값은 기대 답에 있는 서비스 번호 · S/N 을 뜻합니다.

| 대상 턴 | 식별값 전 | 식별값 후 | 평균 글자 수 전 → 후 |
| --- | ---: | ---: | ---: |
| SB3 「거기서 T 4000L만 남겨줘」 | 0/16 | **16/16** | 92 → 196 (표로 바뀜) |
| SB9 「나머지 한 건은 호기가 뭐였지?」 | 0/4 | **4/4** | 45 → 108 |
| SB10 「세 건 표로 정리해줘」 | 0/24 | **24/24** | 383 → 485 |
| SA3 「고객사-013 클레임 몇 건이야?」 | 0/16 | 0/16 | 57 → 56 |
| SB8 「첫 고장이랑 재발 사이 며칠이야?」(대조) | — | — | 86 → 101 |

- 들어간 값은 전부 기대 답과 같습니다. 지어낸 번호는 없었습니다.
- SA3 는 건수를 묻는 질문이라 답을 늘이지 않았습니다. 10-21 C7 판정(「건수만 묻는 질문이면 2건이 정답」)과 같은 기준입니다. 이 질문에도 번호가 나와야 한다면 따로 정해야 합니다.
- 짧은 계산 답(SB8)은 평균 15자 늘었습니다. 늘어난 부분은 「고장일 기준」 한 줄 정도이고, 장황해지지는 않았습니다.
- 원본은 `.issue/432/evidence/before/measure.txt` · `after/measure.txt` 에 있습니다. 답 원문에는 고객 가명이 있어 저장소 밖(QA 폴더 `results/2026-10-23-432/`)에 두었습니다.
- 화면 변화가 없는 지시문 변경이라 캡처 대신 측정 수치를 남겼습니다.

## 변경 파일

- `backend/src/main/java/com/ragchatbot/openai/OpenAiRealService.java` — `RAG_INSTRUCTIONS` 한 줄 + Javadoc 근거
- `backend/src/test/java/com/ragchatbot/openai/OpenAiRealInstructionsTest.java` — 그 줄이 실리는지 잠그는 테스트 1건
- `scripts/case-floors.env` — 백엔드 하한 347 → 348
- `docs/02_architecture/backend.md` · `docs/06_changelog/CHANGELOG.md`

## 검증

- `scripts/check-all.sh` 통과(`after/check-all.txt`) : 백엔드 348건 실패 0 · 하한 348/348 · 프론트 206/206 · 문서 버전 대조 통과
- shellcheck · gitleaks · trivy 는 로컬에 없어 건너뛰었습니다. 이 셋은 CI 에서 돕니다

## 남은 것

- 배포 뒤 운영 앱 경로에서 battery321 을 돌려 기대 출처 유지 · 누출 0 을 확인해야 합니다(완료 기준)
