## 작업 요약
표시 이름에 50자(trim 뒤 코드 포인트) 상한을 둠. 이름 변경(`ProfileService.updateName`)과 계정 발급(`AdminUserService.create`)이 같은 검사(`ProfileService.requireNameLength`)를 쓰며, 넘으면 `BadRequestException("이름은 50자까지 쓸 수 있음")` 으로 400 이고 저장하지 않음(#371 의 메시지 · 제목 상한과 같은 방식). 상한은 `app.user.max-name-chars: ${USER_MAX_NAME_CHARS:50}`, 마이페이지 · 관리자 계정 추가 폼 입력창은 `maxLength={50}`.

## 변경 전후
- 전 : 51자 · 수 MB 이름도 200 / 201 로 저장됨
- 후 : 51자는 400 이고 users 에 저장되지 않음. 이모지 49 + 한글 1 = 50자는 통과(UTF-16 으로는 99 단위)

## 검증
- 변경 전 실패 : `evidence/before/red-tests.txt` (백엔드 2건 400 기대 / 200 · 201 실제, 프론트 2건 maxLength 없음)
- 변경 후 : `evidence/after/green-tests.txt`
- 백엔드 전체 329건 통과(기준 325 + 4), 프론트 197건 통과(기준 195 + 2), lint · build 통과
- `application.yml` 의 모든 `${VAR` 가 `.env.example` 에 있음

## 변경 파일
- backend : `ProfileService` · `AdminUserService` · `application.yml` · `.env.example` · `ProfileFlowTest` · `AdminUserFlowTest` · `AdminUserCreateRaceTest`(생성자 인자)
- frontend : `MyPage.tsx` · `AdminPage.tsx` · 각 테스트
- docs : `api.md`(API-PATCH-001 신설 · API-POST-008 오류표) · `features.md` · `backend.md` · `CHANGELOG.md` · `scripts/case-floors.env`(329 / 197)

## 남은 이슈
- 기존에 50자를 넘겨 저장된 이름이 있으면 그대로 남음(마이그레이션 없음). 다시 이름을 바꿀 때만 상한이 걸림
- `api.md` 에 API-PATCH-001 상세 절이 없어 이번에 신설함
