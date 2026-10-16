## 작업 요약

관리자 계정 발급의 결함 두 가지와 문서 한 곳을 고쳤다.
- **동시 중복 이메일이 409 가 아니라 500 이었다(B4).** 중복 조회와 저장 사이에 같은 이메일로 다른 요청이 끼면 저장 단계의 `DuplicateKeyException` 을 받는 곳이 없었다. 이제 저장만 감싸서 기존 409 「이미 있는 이메일」로 바꾼다
- **발급 이름을 trim 하지 않았다(B5).** 이름 변경 경로(`ProfileService`)와 같게 맞췄다
- **javadoc 이 실제 순서와 달랐다(B2).** 입력 검증 · 경로 변환은 관리자 확인보다 먼저 돈다. 동작은 그대로 두고 javadoc 을 사실대로 고쳤다. 경로가 있다는 사실은 이미 다른 경로로도 드러나므로 바꾸지 않는다

## 검증

| 항목 | 전 | 후 |
| --- | ---: | ---: |
| 동시 중복 → 409(단위, mock) | 실패 | **통과** |
| 중복 키가 `DuplicateKeyException` 으로 오는지(실 PostgreSQL, 대소문자 변형 포함) | — | **통과** |
| 이름 trim(HTTP 경로, 201 확인 후 저장값) | 실패 | **통과** |
| 잘못된 경로는 관리자 확인보다 먼저 400(현재 동작 고정) | 통과 | 통과 |
| 백엔드 전체(`mvnw verify`, main #323~#325 반영 후) | 287 | **291 통과** |

- 리뷰 : APPROVE. 제안을 반영했다
  - 실 DB 로 예외 변환을 확인하는 테스트 추가
  - trim 테스트에서 201 응답 먼저 확인
  - catch 옆에 「email 이 users 의 유일한 업무 유니크 키일 때만 맞다」 한 줄 주석
- 원본 : `.issue/327/evidence/`

## 변경 파일

- `backend/.../service/AdminUserService.java` · `controller/AdminController.java`(javadoc)
- 테스트 : `AdminUserCreateRaceTest`(새로 만듦) · `UserRepositoryDuplicateKeyTest`(새로 만듦) · `AdminUserFlowTest`
- CHANGELOG · `scripts/case-floors.env` : 백엔드 하한 287 → 291(실측)

## 남은 이슈

없음. `api.md` 계정 발급 오류 표에는 이미 409 행이 있다
