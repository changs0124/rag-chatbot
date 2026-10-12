## 운영 서버를 GCP e2-micro 에서 AWS Lightsail 서울로 옮겼다 (2026-10-12)

**분류** : neither(화면 변경 없음) — 증거는 텍스트 로그다.

### 결정 (사용자 확인)
- 백업 : **Lightsail 자동 스냅샷**(UTC 19:00 = KST 04:00) — `scripts/backup.sh` · GCS cron 폐기
- 접속 : `~/.ssh/config` 별칭, 필수 env 는 `DEPLOY_HOST` 하나 (IP 는 저장소에 없음)
- 메모리 : `app` 420m → **1g**(스왑 금지 #202 유지) · `db` 160m → **512m**
- SSH 키 : 서울 리전 기본 키 → IAM 정책에 `lightsail:DownloadDefaultKeyPair` 거부

### 전환 (중단 약 3분, 09:03~09:06 KST)
1. 무중단 복사 : `.env` · `backend/.env` · `secrets/tunnel_token` · 그림 295장 (권한 600/600/700·644/755·644)
2. GCP `app` · `cloudflared` 정지 → `pg_dump -Fc`(목차 검증) + uploads tar
3. Lightsail `db` 만 기동(빈 볼륨 → #130 캡 init 경로 통과) → `pg_restore --exit-on-error`
4. `DEPLOY_HOST=<별칭> bash scripts/deploy.sh --skip-build` → exit 0 · 헬스 10초

### 검증
| 항목 | before (GCP) | after (Lightsail) |
|---|---|---|
| 헬스 응답 | 0.52~1.68초 | **0.28~0.40초** |
| CORS 허용 / 타 출처 | 200 / 403 | 200 / 403 |
| 표 7개 행 수 | users 1 · conv 2 · msg 6 · cite 3 · docs 4 · att 0 · flyway 9 | **동일** |
| 터널 연결 | — | 4개 전부 서울(icn05~07) |
| 그림 | 295 | 295 (app 컨테이너에서) |
| 메모리 | 시스템 664Mi/953Mi · app 270MiB/420MiB | 시스템 825Mi/3.7Gi · app 151MiB/1GiB |
| 데모 로그인·답변 | — | 사용자 확인 |

정리 : GCP 프로젝트 삭제 요청(VM · 디스크 · GCS 버킷 · 서비스 계정, 30일 내 복구 가능). 마지막 덤프는 저장소 밖 로컬에 보관.

### 증거
- before : [배포 설정](https://github.com/changs0124/rag-chatbot/blob/2ee3477/.issue/243/evidence/before/01-배포-설정-현재.txt) · [운영 응답·메모리](https://github.com/changs0124/rag-chatbot/blob/2ee3477/.issue/243/evidence/before/02-운영-GCP-응답-메모리.txt)
- after : [deploy 실행 로그](https://github.com/changs0124/rag-chatbot/blob/2ee3477/.issue/243/evidence/after/01-deploy-실행.log) · [운영 검증](https://github.com/changs0124/rag-chatbot/blob/2ee3477/.issue/243/evidence/after/02-운영-Lightsail-검증.txt) · [배포 설정](https://github.com/changs0124/rag-chatbot/blob/2ee3477/.issue/243/evidence/after/03-배포-설정-변경후.txt)

### 커밋
- `9c85a0d` chore(243): 배포를 Lightsail(ssh 별칭)로 옮기고 백업을 스냅샷으로 바꾼다
- `e46dee2` docs(243): Lightsail 전환 완료를 운영 상태 문서에 반영한다

### 남은 것
- [ ] `aws --profile rag-lightsail lightsail get-instances` 성공 + IAM 거부 확인 (액세스 키 입력 대기)
- [ ] 방화벽 22 만 · 자동 스냅샷 설정을 CLI 로 확인, 첫 스냅샷 생성 확인
