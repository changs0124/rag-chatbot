## 작업 리포트 — 문서↔코드 불일치 수정

브랜치 `docs/296-docs-code-mismatch` · 14파일 +109 / −82 · 문서 + compose 주석만

| 문서 | 고친 사실(근거 코드) |
| --- | --- |
| `overview.md` | 전역 동시 상한 「8」→ 16(링크) · 시퀀스도 순서 동시성 → 레이트리밋(`ChatController` #96) |
| `backend.md` | 배포 성공 시 `:previous` 를 지운다(`deploy.sh`) — 성공 뒤 롤백은 손으로 남긴 `prev-<sha>` 태그 · `ubuntu` 는 docker 그룹 아님(sudo) · 이력에서 `timed_out && stopped` 제외(#84) · 읽기 타임아웃은 `stream-read-timeout-ms` 가 맡음 |
| `api.md` | SSE `error` = `STREAM_ERROR` · 「응답 생성 중 오류」, 코드 표에 행 추가 · `finishReason` 항상 `stop` · 404 는 인증된 요청 기준(미인증이면 401) · 그림 404 는 live 한정 |
| `erd.md` | mermaid `messages.timed_out`(V7) · `attachments.message_id` on delete cascade(V1) |
| `requirements.md` | 「5절」→「6절」 |
| `features.md` | 세션 : 토큰 120분 · 남은 30분 미만이면 재발급 · 업로드는 `Composer` 가 고를 때 · 문서 칩은 아이콘 + 「문서」 · 사용량은 완료 이벤트에서 · OPS-002 표는 「도입 전 상태」 |
| `design-system.md` · `CONVENTIONS.md` · `frontend.md` | 색 리터럴 허용 목록 정본 하나(모달·드로어 배경 `bg-black/40` · 사진 오버레이 · `DocFigure` `bg-white` 포함) · 「아래 둘」→ 하나 · 화면 제목 실제 크기 · 14px 하한은 답변 문단 · MyPage 세그먼트 컨트롤 제거됨 · 없는 절 참조 수정 · 지운 기능 예시 |
| `current-sprint.md` · `backlog.md` | 닫힌 #245~#254 · 끝난 `[x]` 항목 제거, 10-15 갱신 |
| `live-integration.md` | 운영 `gpt-6-sol` · 10-15 스토어 교체(ID 없음) · 부착률 결론(5/5) · 동기화 뒤 삭제 가능(#193) · 문서 목적 |
| `docker-compose.yml`(주석) | 「다섯 개」→ 네 개 · 인바운드는 서비스 포트만 불필요(SSH 22 예외) |

- 문서 머리 날짜 · 버전 갱신(api · erd · requirements · features · live-integration · design-system · overview)
- 장황함 축약 · 문서 간 중복 정리는 하지 않았다(#297 몫)
- 문서 게이트 4종 통과
