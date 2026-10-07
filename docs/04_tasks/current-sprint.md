# Current Sprint

> 마지막 업데이트 : 2026-10-07

여기에는 **아직 안 끝난 것만** 둔다. 끝난 일의 경위는 [CHANGELOG](../06_changelog/CHANGELOG.md) 가 정본이다.
아직 착수하지 않은 항목은 [backlog.md](./backlog.md) 에 있다.

## 진행 중

없음. **런칭은 2026-10-06 에 끝났다** — 이 파일에 있던 런칭 항목(준비물 · 대기 이슈 #130 · #132 · 순서)은
전부 처리됐고, 경위는 [CHANGELOG](../06_changelog/CHANGELOG.md) 가 정본이다.

열린 이슈 중 할 일은 [#202](https://github.com/changs0124/rag-chatbot/issues/202)(업로드 부하에서 스왑 허용 여부 실측)
하나다. 운영 VM 에 부하를 거는 일이라 **시간대와 방법을 먼저 정해야** 착수할 수 있다.

## 완료

이 파일에는 두지 않는다. 끝난 일은 [CHANGELOG](../06_changelog/CHANGELOG.md) 가 정본이다.

## 블로커

없음.

**#105 는 대기 항목이 아니다.** [#105](https://github.com/changs0124/rag-chatbot/issues/105)
는 병렬 코드 리뷰에서 **「지금 고치지 않는다」로 판정한 항목들의 영구 기록**이라 닫지 않는 것이
의도다(`wontfix`). 열린 이슈 수를 세어 할 일을 가늠할 때 이것을 묶지 않는다.

**GitHub Actions 한도 문제는 해소됐다**(2026-09-11 공개 전환). 공개 저장소는 standard runner
분이 무료다. PR #134 에서 7잡 중 코드 4잡이 정상 완주하는 것을 확인했고, #135 로 `secrets`·`deps`
3잡도 변경마다 돌도록 되돌렸다. 로컬 예행(`bash scripts/check-all.sh`)은 **왕복 시간을 아끼는
용도로** 그대로 유용하다.
