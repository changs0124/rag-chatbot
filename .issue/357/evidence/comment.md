## 작업 리포트 — db 이미지 다이제스트 고정

**작업 성격** : neither(설정 · 문서). 화면 캡처 대신 다이제스트 대조와 기동 시험 결과를 텍스트 증거로 남겼다.

### 발견
- 같은 `postgres:16-alpine` 태그가 **로컬(2026-07-07 빌드, `57c72fd2…`)과 운영(2026-09-17 빌드, `721873c3…`)에서 이미 다른 이미지**였다. 이 이슈가 말한 문제가 실제로 있었다.
- 운영 이미지는 오늘 레지스트리의 `16-alpine` 인덱스 다이제스트와 같다(PostgreSQL 16.15 · alpine 3.24.2).

### 변경 (`bfbffbd`)
- `docker-compose.yml` : `image: postgres:16-alpine@sha256:721873c3…080ea`. 운영 이미지와 같게 맞췄다. 갱신 절차는 cloudflared 와 같은 형식의 주석으로 남겼다.
- `backend.md` 하드닝 문단의 다이제스트 고정 대상에 `db` 를 더했다. backlog 항목은 지웠고 CHANGELOG 에 기록했다.

### 검증
| 항목 | 결과 |
|------|------|
| compose 해석 | 고정 다이제스트로 해석됨. 운영 이미지 ID 와 일치 |
| 빈 볼륨 초기화(`cap_add` 넷) | `init process complete` 뒤 healthy |
| 태그 설정 → 고정 설정 `up` | **db 컨테이너가 한 번 재생성됨**(이미지는 같고 데이터는 볼륨에 남는다). app 은 `depends_on` 설정상 재시작 대상이 아니다(추론 · 미실측) |
| `check-all.sh docs` | 통과(shellcheck 만 로컬 미설치로 건너뜀) |

### 운영 반영 때 주의
다음 배포의 `compose up -d` 에서 db 가 수 초 재시작된다. 이미지와 데이터는 그대로다.

증거 : [before](https://github.com/changs0124/rag-chatbot/blob/main/.issue/357/evidence/before/01-digests.txt) · [after](https://github.com/changs0124/rag-chatbot/blob/main/.issue/357/evidence/after/01-verify.txt)
