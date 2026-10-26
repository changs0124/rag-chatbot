## #476 작업 리포트 — 브랜치 `fix/476-upstream-5xx-admin-docs` · 커밋 `34597a0`

### 정한 것 (10-26 사용자 결정)
- 업로드 중 OpenAI 일시 장애(5xx · 연결 실패) → **503 `SERVICE_UNAVAILABLE`** + 「잠시 뒤 다시 시도」, 로그는 WARN 한 줄
- 재시도는 **DELETE 만**(되풀이해도 결과가 같고 404 도 성공). 업로드 POST 는 OpenAI 가 실제로는 처리했을 수 있어 다시 보내면 중복 · 고아 파일이 생김
- 재시도까지 실패한 파일 삭제 → **ERROR 로그(file_id + 직접 지우는 법) + 문서화**. 계정 파일을 쓸어 지우는 복구는 같은 계정의 다른 파일까지 지울 위험이 있어 넣지 않음 → 완료 기준 2번은 「재시도 + ERROR 로그로 알린다」로 읽음

### 전후 비교 (가짜 OpenAI 서버, 같은 탐침을 변경 전 `e3e2cf2` · 변경 후 `34597a0` 에 실행)

| 시나리오 | 전 | 후 |
| --- | --- | --- |
| A 업로드 `POST /files` 503 | 500 `INTERNAL_ERROR` · **ERROR** 「처리되지 않은 예외」 | **503 `SERVICE_UNAVAILABLE`** · WARN 1줄 |
| B 업로드 연결 거절 | 500 `INTERNAL_ERROR` · **ERROR** | **503 `SERVICE_UNAVAILABLE`** · WARN 1줄 |
| C 해제 성공 + 파일 삭제 503 계속 | 파일 삭제 1회 · WARN 만(고아가 조용히 남음) | 파일 삭제 **3회** → **ERROR** 「스토어 밖 고아로 남음 … 직접 지울 것」 |
| D 파일 삭제 503 두 번 뒤 성공 | 1회 시도 후 포기 → **고아 남음** | 3회째 성공 → **고아 없음** |
| E 연결 해제 503 한 번 뒤 성공 | 해제 1회 후 포기 → 파일 남김(동기화로 복구 필요) | 해제 2회째 성공 → 파일까지 삭제 |

원본 로그 : `.issue/476/evidence/before/summary.txt` · `after/summary.txt`(전체 출력은 같은 폴더 `probe.txt`), 탐침 소스 `.issue/476/Issue476ProbeTest.java.txt`(구현 커밋에는 넣지 않음)

### 검증
- `./mvnw verify` : **385건 통과 · 실패 0 · 건너뜀 0**(하한 377 → 385)
- 새 테스트 : TC-ADMIN-062~065(삭제 재시도 · 상한 · 해제 재시도 · 4xx 는 다시 보내지 않음) · TC-ADMIN-066~068(업로드 503 · 연결 거절 · 연결 단계 503 이면 파일 정리 뒤 503) · TC-OPS-035(503 매핑 · 원문 미노출)
- TC-ADMIN-056 의 기대값을 바꿈 : 연결 해제 500 이 이제 3번 시도됨(파일은 여전히 안 지움)
- `scripts/check-all.sh docs` 통과(shellcheck 는 로컬에 없어 건너뜀, CI 에서 돎)
- 프론트는 바꾸지 않음 — 관리자 화면이 서버 `message` 를 그대로 띄움(`AdminPage.tsx` `errorMessage`)

### 남은 일
- PR · 리뷰 · merge 뒤 **백엔드 배포 필요**(롤백 태그 `prev-a05d994` 먼저)
