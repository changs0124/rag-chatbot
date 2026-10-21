# Current Sprint

> 마지막 업데이트 : 2026-10-21

여기에는 **아직 안 끝난 것만** 둔다. 끝난 일의 경위는 [CHANGELOG](../06_changelog/CHANGELOG.md) 가 정본이다.
아직 착수하지 않은 항목은 [backlog.md](./backlog.md) 에 있다.

## 진행 중

없음. 10-16 리뷰 후속 [#359](https://github.com/changs0124/rag-chatbot/issues/359) · [#360](https://github.com/changs0124/rag-chatbot/issues/360) · [#363](https://github.com/changs0124/rag-chatbot/issues/363) · [#365](https://github.com/changs0124/rag-chatbot/issues/365) 은 merge 했고 운영 배포까지 마쳤다(2026-10-16, main `0e88492`). 후속 [#367](https://github.com/changs0124/rag-chatbot/issues/367) `cleanupUnreferencedFiles` 루프 중단도 merge · 운영 배포했다(2026-10-16, main `b63b498`).

2026-10-19 : [#369](https://github.com/changs0124/rag-chatbot/issues/369) 통합 테스트 이미지 고정 · [#371](https://github.com/changs0124/rag-chatbot/issues/371) 메시지 4000자 · 제목 100자 상한 · [#372](https://github.com/changs0124/rag-chatbot/issues/372) 인용 표기 지운 자리 빈칸 문장을 merge 하고(main `2ee8f8c`) 운영 배포 · 운영 확인까지 마쳤다. #371 · #372 는 운영 탐침 · 고난도 QA(10-19)에서 나온 항목이다.

2026-10-21 : [#375](https://github.com/changs0124/rag-chatbot/issues/375) 진행 단계에 첨부 이미지 분석 · 참조 문서 확인(자료명) · [#376](https://github.com/changs0124/rag-chatbot/issues/376) 무자료 답의 절차 단계 금지 · [#377](https://github.com/changs0124/rag-chatbot/issues/377) 예외 정격(BRAKE 30 mA) · [#378](https://github.com/changs0124/rag-chatbot/issues/378) 알람 번호 질문의 매뉴얼 재검색 · 오타 번호 안내 · [#382](https://github.com/changs0124/rag-chatbot/issues/382) vite 8.1.6(advisory 로 막힌 deps-frontend)을 merge 하고(main `4f7b9e4`) 운영 배포 · 운영 확인까지 마쳤다. 지시문 세 건은 합친 실제 문자열로 다시 재 배터리 기대 출처 56/56 을 확인한 뒤 배포했다.

다음 할 일 : 없음. [backlog.md](./backlog.md) 에서 고른다.

## 블로커

없음.

**#105 는 대기 항목이 아니다.** [#105](https://github.com/changs0124/rag-chatbot/issues/105)
는 병렬 코드 리뷰에서 **「지금 고치지 않는다」로 판정한 항목들의 영구 기록**이라 닫지 않는 것이
의도다(`wontfix`). 열린 이슈 수를 세어 할 일을 가늠할 때 이것을 묶지 않는다.
