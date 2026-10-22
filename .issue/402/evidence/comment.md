## 작업 요약
`FileService.upload` 의 10MB 검사를 `getBytes()` **앞**으로 옮겼다. 멀티파트 파트는 디스크 임시 파일이라 `getSize()` 는 힙을 쓰지 않는다.
응답은 그대로다(400 · `용량 초과(image 최대 10MB)`). 「400 을 413 보다 먼저」(#35)는 유지된다 — 26MB 이하는 여전히 400, 그 위는 멀티파트 413.

## 변경 전후
| 상황 | 전 | 후 |
| --- | --- | --- |
| 10MB 초과 파일 | 힙에 통째로 올린 뒤 400 | 힙에 올리지 않고 **400**(같은 문구) |
| 26MB × 동시 30 (한 사용자) | 거절 전 약 780MB 힙 → 힙(약 650MB) 초과 가능 | 힙에 오르는 것은 10MB 이하만 → **최대 약 300MB** |

## 검증
- 변경 전 실패 : `before/red-tests.txt` — `FileServiceSizeCheckTest`(목 `getSize()` 11MB, `getBytes()` 미호출 단언)
- 변경 후 통과 : `after/green-tests.txt` (`FileFlowTest` 의 기존 문구 케이스 포함)
- `bash scripts/check-all.sh` 통과 : `after/check-all.txt` — **백엔드 320 / 하한 320 · 프론트 191 / 하한 191**

## 변경 파일
- `backend/.../service/FileService.java` · 테스트 `FileServiceSizeCheckTest`(신규)
- `docs/02_architecture/overview.md` 「알려진 제약」 · `CHANGELOG.md` · `scripts/case-floors.env`

## 남은 이슈
- 통과한 10MB 이하 파일은 여전히 통째로 힙에 오른다(스트리밍 저장은 별건, overview 에 기록)
- #401 과 `CHANGELOG` 맨 위 · `case-floors.env` 가 겹친다 — 합칠 때 하한은 합친 뒤 실측값으로
- 운영 반영은 백엔드 재배포가 필요하다
