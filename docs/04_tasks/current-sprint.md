# Current Sprint

> 마지막 업데이트: 2026-08-18

## 진행 중

- [ ] (비어 있음 — 착수한 작업을 여기에 적는다)

## 완료

- [x] 전 화면 재디자인 (Claude 계열 웜 톤) + 사이드바 폭 조절(FEAT-UI-001) — 색을 토큰으로 접고
  답변 말풍선을 걷어냄. 설계는 `docs/99_inbox/design-system.md` · `docs/99_inbox/redesign-wireframe.md`

- [x] 첨부 미리보기 (FEAT-CHAT-001~003) — 입력창 썸네일 카드 · 즉시 업로드 · 확대 보기 · 드롭/붙여넣기.
  설계는 `docs/99_inbox/features.md` · `docs/99_inbox/wireframe.md` · `docs/99_inbox/scenarios.md`

- [x] 진행 단계 문구가 참조한 자료명을 밝힘 (#8) — 조회 단계 라벨에 출처와 같은 값의 자료명을 실음
- [x] Node 22 → 24 승격 + 배포 런타임 대조 게이트 확장 (#5) — Vercel 이 이미 24 로 빌드하는데 저장소는 22 를 선언하고 있던 불일치 해소
- [x] `nanoid` · `postcss` 취약점 패치 (#6) — advisory 공개로 빨간불이 된 `npm audit` 게이트 복구
- [x] docs/ 구조 재구성 — AI 협업용 문서 생성(진입점 · 구조 · 컨벤션 · 피드백)
- [x] 코드 리뷰 — 출처 조회 N+1 제거, OpenAI 삭제 경로 base-url 버그 수정, 죽은 코드 정리

## 블로커

없음
