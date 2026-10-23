# Current Sprint

> 마지막 업데이트 : 2026-10-23

여기에는 **아직 안 끝난 것만** 둔다. 끝난 일의 경위는 [CHANGELOG](../06_changelog/CHANGELOG.md) 가 정본이다.
아직 착수하지 않은 항목은 [backlog.md](./backlog.md) 에 있다.

## 진행 중

없음. 10-16 리뷰 후속 [#359](https://github.com/changs0124/rag-chatbot/issues/359) · [#360](https://github.com/changs0124/rag-chatbot/issues/360) · [#363](https://github.com/changs0124/rag-chatbot/issues/363) · [#365](https://github.com/changs0124/rag-chatbot/issues/365) 은 merge 했고 운영 배포까지 마쳤다(2026-10-16, main `0e88492`). 후속 [#367](https://github.com/changs0124/rag-chatbot/issues/367) `cleanupUnreferencedFiles` 루프 중단도 merge · 운영 배포했다(2026-10-16, main `b63b498`).

2026-10-19 : [#369](https://github.com/changs0124/rag-chatbot/issues/369) 통합 테스트 이미지 고정 · [#371](https://github.com/changs0124/rag-chatbot/issues/371) 메시지 4000자 · 제목 100자 상한 · [#372](https://github.com/changs0124/rag-chatbot/issues/372) 인용 표기 지운 자리 빈칸 문장을 merge 하고(main `2ee8f8c`) 운영 배포 · 운영 확인까지 마쳤다. #371 · #372 는 운영 탐침 · 고난도 QA(10-19)에서 나온 항목이다.

2026-10-21 : [#375](https://github.com/changs0124/rag-chatbot/issues/375) 진행 단계에 첨부 이미지 분석 · 참조 문서 확인(자료명) · [#376](https://github.com/changs0124/rag-chatbot/issues/376) 무자료 답의 절차 단계 금지 · [#377](https://github.com/changs0124/rag-chatbot/issues/377) 예외 정격(BRAKE 30 mA) · [#378](https://github.com/changs0124/rag-chatbot/issues/378) 알람 번호 질문의 매뉴얼 재검색 · 오타 번호 안내 · [#382](https://github.com/changs0124/rag-chatbot/issues/382) vite 8.1.6(advisory 로 막힌 deps-frontend)을 merge 하고(main `4f7b9e4`) 운영 배포 · 운영 확인까지 마쳤다. 지시문 세 건은 합친 실제 문자열로 다시 재 배터리 기대 출처 56/56 을 확인한 뒤 배포했다.

2026-10-21 저녁 : 전체 코드 · 문서 리뷰 후속 [#385](https://github.com/changs0124/rag-chatbot/issues/385) 프론트 결함 셋(한글 조합 Enter · 사용자 글의 그림 표식 · 대화 목록 로드 실패) · [#386](https://github.com/changs0124/rag-chatbot/issues/386) 파일 없는 첨부 404 · [#387](https://github.com/changs0124/rag-chatbot/issues/387) 문서 동기화(운영 되돌리기 안내 정정 포함) · [#388](https://github.com/changs0124/rag-chatbot/issues/388) CHANGELOG 배포별 분리 · [#389](https://github.com/changs0124/rag-chatbot/issues/389) · [#390](https://github.com/changs0124/rag-chatbot/issues/390) 중복 정리 · [#391](https://github.com/changs0124/rag-chatbot/issues/391) 쓰지 않는 OpenAI 정리 경로와 컬럼 셋 제거(Flyway V10) · [#392](https://github.com/changs0124/rag-chatbot/issues/392) 주석 정리를 merge 하고(main `50f13a2`) 운영 배포 · 운영 확인까지 마쳤다.

2026-10-22 : 전체 QA(보안 · 성능 리뷰 · 스캔 · 테스트) 후속 [#401](https://github.com/changs0124/rag-chatbot/issues/401) 첨부 5장 상한 + OOM 시 JVM 종료 · [#402](https://github.com/changs0124/rag-chatbot/issues/402) 업로드 용량 선검사 · [#403](https://github.com/changs0124/rag-chatbot/issues/403) 토큰 절대 수명 12시간 · [#404](https://github.com/changs0124/rag-chatbot/issues/404) Vercel 보안 헤더 · [#405](https://github.com/changs0124/rag-chatbot/issues/405) 스트리밍 재렌더 memo 를 merge 하고(main `634deee`) 운영 배포 · 운영 스모크까지 마쳤다. 이어서 남은 항목 [#411](https://github.com/changs0124/rag-chatbot/issues/411) CSP 강제 전환 · [#412](https://github.com/changs0124/rag-chatbot/issues/412) 탭 간 로그아웃 · [#413](https://github.com/changs0124/rag-chatbot/issues/413) 이름 50자 · [#414](https://github.com/changs0124/rag-chatbot/issues/414) 답변 링크를 글자로 · [#415](https://github.com/changs0124/rag-chatbot/issues/415) 앱 DB 런타임 계정(`ragapp`) · [#416](https://github.com/changs0124/rag-chatbot/issues/416) 베이스 이미지 · CI 액션 고정 · [#417](https://github.com/changs0124/rag-chatbot/issues/417) Markdown 지연 로딩 · [#418](https://github.com/changs0124/rag-chatbot/issues/418) 사용자별 첨부 한도 500MB 를 merge 하고(main `ad55f58`) 운영 배포 · 운영 확인(런타임 계정 접속 · 강제 CSP 위반 0 · 스모크)까지 마쳤다. 롤백 이미지 `prev-634deee` · `prev-50f13a2`, 런타임 계정을 끄려면 서버 `.env` 의 `APP_DB_*` 를 비운다(`.env.bak-415`).

2026-10-22 저녁 : 헤비 QA 후속 [#427](https://github.com/changs0124/rag-chatbot/issues/427) 「그림 전부」 요청 지시문을 merge 하고(main `4ce4f12`) 운영 배포 · 앱 경로 확인(F6 25/25 · F2 35/35)까지 마쳤다.

2026-10-23 : 운영 토큰 소모 QA(940턴, 오류 · 누출 · 저장 불일치 0)에서 나온 [#429](https://github.com/changs0124/rag-chatbot/issues/429) 인용 표기 지운 자리 빈칸 잔여 사례(#372 후속, 필터가 문서 이름을 넣음)를 merge 하고(main `a25ee42`) 운영 배포 · 운영 배터리(기대 출처 33/33 · 누출 0 · 빈칸 0)까지 마쳤다. 롤백 이미지 `prev-4ce4f12`.

**관찰(이슈 아님)** : F2(알람 + 과거 사례) 답이 매뉴얼 내용을 쓰고도 출처에 매뉴얼을 빼는 경우가 있다 — 운영 battery 10-21 2회 중 1회 · 10-23 1회 중 0회, 원 API 6회 중 0회(인용 표기 0건 1회 · 클레임만 1회는 답에도 매뉴얼 내용 없음). 모델의 인용 표기 누락 변동이라 코드 결함은 아니다. 다시 보이면 횟수를 여기에 더하고, 잦아지면 이슈로 올린다.

다음 할 일 : 없음. [backlog.md](./backlog.md) 에서 고른다.

## 블로커

없음.

**#105 는 대기 항목이 아니다.** [#105](https://github.com/changs0124/rag-chatbot/issues/105)
는 병렬 코드 리뷰에서 **「지금 고치지 않는다」로 판정한 항목들의 영구 기록**이라 닫지 않는 것이
의도다(`wontfix`). 열린 이슈 수를 세어 할 일을 가늠할 때 이것을 묶지 않는다.
