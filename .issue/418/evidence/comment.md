## 작업 요약

사용자별 첨부 저장 한도를 둔다(기본 500MB, `ATTACHMENT_QUOTA_MB`). `FileService.upload` 는 형식 · 크기 · 매직바이트 검사를 마친 뒤 **디스크에 쓰기 전에** 사용자 폴더(`{storage-root}/{userId}/`)의 실제 파일 크기 합을 본다. 지금 쓰는 양에 올릴 파일 크기를 더해 한도를 넘으면 400 으로 거절한다.

- 마이그레이션은 없다. 폴더를 직접 세므로 기존 파일까지 정확하다. 첨부나 대화를 지우면 지운 만큼 다시 올릴 수 있다
- 거절 문구 : 「첨부 저장 한도 초과(사용자당 500MB) - 오래된 대화를 지우면 다시 올릴 수 있음」
- `FileStorage.usedBytes(UUID)` 를 추가했다. 폴더가 없으면 0 이고, 세는 도중 지워진 파일도 0 으로 본다

## 변경 전후

| | 변경 전 | 변경 후 |
|---|---|---|
| 한도 1MB 에서 600KB PNG 를 두 번째로 올릴 때 | 200, 파일과 행이 하나씩 더 생김 | 400(문구에 한도 표시), 파일 · 행 그대로 |
| 첨부를 지운 뒤 다시 올릴 때 | (한도 없음) | 200 |
| 다른 사용자가 한도에 닿았을 때 내 업로드 | 200 | 200(한도는 사용자별) |

## 검증

- 변경 전 : `LocalFileStorageUsedBytesTest` 는 `usedBytes` 가 없어 컴파일 실패. 이 테스트를 빼고 돌린 `AttachmentQuotaTest` 는 3건 모두 실패(`expected: 400 but was: 200`) - `before/red-tests.txt`
- 변경 후 : 위 두 클래스와 함께 `FileFlowTest` · `UploadRateLimitTest` · `AttachmentLinkRaceTest` · `FileServiceSizeCheckTest` 를 돌려 전부 통과 - `after/green-tests.txt`
- 백엔드 전체 `./mvnw -q test` : **330건 통과**(기존 325 + 5). `scripts/case-floors.env` 의 `BACKEND_MIN` 을 325 에서 330 으로 올림
- `bash scripts/check-all.sh docs` 통과. `application.yml` 의 `${VAR` 는 전부 `backend/.env.example` 에 있음

## 변경 파일

- `backend/src/main/java/com/ragchatbot/storage/FileStorage.java` - `usedBytes` 추가
- `backend/src/main/java/com/ragchatbot/storage/LocalFileStorage.java` - 사용자 폴더를 걸으며 크기를 합산
- `backend/src/main/java/com/ragchatbot/service/FileService.java` - 한도 주입과 업로드 검사(`store` 앞)
- `backend/src/main/resources/application.yml` - `app.file.attachment-quota-mb: ${ATTACHMENT_QUOTA_MB:500}`
- `backend/src/test/.../controller/AttachmentQuotaTest.java` (신규 3건) · `storage/LocalFileStorageUsedBytesTest.java` (신규 2건)
- `backend/src/test/.../service/AttachmentLinkRaceTest.java` · `FileServiceSizeCheckTest.java` - 생성자 인자 추가에 맞춤
- `backend/.env.example` · `docs/01_specs/api.md`(API-POST-004 절 신설) · `docs/02_architecture/backend.md` 「유량 제어」 · `docs/06_changelog/CHANGELOG.md` · `scripts/case-floors.env`

## 남은 이슈

- **비용** : 업로드마다 그 사용자 폴더를 한 번 걷는다(`Files.walk`). 파일 수에 비례하지만 한도가 걷는 양을 묶는다. 500MB 를 장당 최소 수 KB 로 채워도 수만 개 수준이고, 실사용 이미지(수백 KB~수 MB)라면 수백~수천 개다. DB 집계 컬럼을 두지 않은 대가이며, 커지면 사용량 캐시나 행 기준 합계로 옮긴다
- **동시 업로드 경합** : 확인과 쓰기 사이에 잠금이 없다. 한 사용자가 동시에 올리면 한도를 업로드 1건분(최대 10MB × 동시 요청 수)만큼 넘길 수 있다. 분당 상한(30)이 그 폭을 묶으므로 감수한다
- `overview.md` 「알려진 제약」에는 디스크가 찬다는 문장이 없어 고치지 않았다
