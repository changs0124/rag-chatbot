# Current Sprint

> 마지막 업데이트 : 2026-10-16

여기에는 **아직 안 끝난 것만** 둔다. 끝난 일의 경위는 [CHANGELOG](../06_changelog/CHANGELOG.md) 가 정본이다.
아직 착수하지 않은 항목은 [backlog.md](./backlog.md) 에 있다.

## 진행 중

10-16 리뷰 후속 [#359](https://github.com/changs0124/rag-chatbot/issues/359) · [#360](https://github.com/changs0124/rag-chatbot/issues/360) · [#363](https://github.com/changs0124/rag-chatbot/issues/363) · [#365](https://github.com/changs0124/rag-chatbot/issues/365) 은 merge 했고 운영 배포까지 마쳤다(2026-10-16, main `0e88492`).

- [#367](https://github.com/changs0124/rag-chatbot/issues/367) `cleanupUnreferencedFiles` 루프가 파일 삭제 실패에서 멈추는 것(#365 와 같은 구조). 백엔드가 바뀌므로 merge 뒤 `scripts/deploy.sh` 로 배포한다

그 밖은 [backlog.md](./backlog.md) 에서 고른다.

## 블로커

없음.

**#105 는 대기 항목이 아니다.** [#105](https://github.com/changs0124/rag-chatbot/issues/105)
는 병렬 코드 리뷰에서 **「지금 고치지 않는다」로 판정한 항목들의 영구 기록**이라 닫지 않는 것이
의도다(`wontfix`). 열린 이슈 수를 세어 할 일을 가늠할 때 이것을 묶지 않는다.
