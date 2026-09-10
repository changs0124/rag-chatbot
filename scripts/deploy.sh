#!/usr/bin/env bash
# 백엔드 이미지를 로컬에서 빌드해 서버로 옮기고 다시 띄운다(#127).
#
# **왜 레지스트리를 쓰지 않나** : 배포 서버가 1GB 급(GCP e2-micro)이라 거기서 빌드할 수 없고,
# 그렇다고 GHCR 을 끼우면 비공개 저장소 기준 패키지 저장(500MB)·전송(1GB/월) 이 또 유료 한도에
# 걸린다 - GitHub Actions 한도로 CI 가 멎은 것과 같은 함정을 하나 더 들이는 셈이다.
# 압축 후 90MB 남짓이라 그냥 넘기는 편이 싸고 단순하다. GCP 인바운드 전송은 무료다.
#
# 사용법 :
#   bash scripts/deploy.sh                 # 빌드 → 전송 → 기동
#   bash scripts/deploy.sh --skip-build    # 이미 빌드된 이미지로 전송만
#   bash scripts/deploy.sh --dry-run       # 무엇을 할지만 출력
#
# 서버 접속은 gcloud 를 쓴다. 환경변수로 바꿀 수 있다 :
#   DEPLOY_HOST(기본 free-vm) · DEPLOY_ZONE · DEPLOY_PROJECT · DEPLOY_DIR
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

HOST="${DEPLOY_HOST:-free-vm}"
ZONE="${DEPLOY_ZONE:-us-west1-b}"
PROJECT="${DEPLOY_PROJECT:-free-vm-haeya-260910}"
REMOTE_DIR="${DEPLOY_DIR:-/home/User/deploy}"
IMAGE="rag-chatbot-backend:latest"
TARBALL="backend-image.tar.gz"

SKIP_BUILD=0
DRY=0
for a in "$@"; do
	case "$a" in
		--skip-build) SKIP_BUILD=1 ;;
		--dry-run)    DRY=1 ;;
		*) echo "알 수 없는 인자: $a" >&2; exit 2 ;;
	esac
done

say() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
ssh_run() { gcloud compute ssh "$HOST" --zone="$ZONE" --project="$PROJECT" --quiet --command="$1"; }

if [ "$DRY" = 1 ]; then
	cat <<EOF
호스트   $HOST ($ZONE / $PROJECT)
원격 경로 $REMOTE_DIR
이미지   $IMAGE
단계     $([ "$SKIP_BUILD" = 1 ] && echo '전송 → 로드 → 기동' || echo '빌드 → 저장 → 전송 → 로드 → 기동')
EOF
	exit 0
fi

# 1. 빌드 --------------------------------------------------------------------
# 서버가 아니라 여기서 빈다. compose 본체에 build 키가 없는 것과 짝을 이룬다
if [ "$SKIP_BUILD" = 0 ]; then
	say "이미지 빌드"
	docker build -t "$IMAGE" backend
fi

# 2. 저장 --------------------------------------------------------------------
say "이미지 저장 (gzip)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
docker save "$IMAGE" | gzip -c > "$TMP/$TARBALL"
ls -lh "$TMP/$TARBALL" | awk '{print "  크기: " $5}'

# 3. 전송 --------------------------------------------------------------------
# compose 파일도 같이 보낸다 - 서버의 것이 저장소보다 뒤처져 조용히 다른 설정으로 도는 사고를 막는다.
# .env 두 개는 **보내지 않는다.** 비밀이 로컬에 있을 이유가 없고, 서버에 이미 있다
say "서버로 전송"
gcloud compute scp "$TMP/$TARBALL" "$HOST:$REMOTE_DIR/" --zone="$ZONE" --project="$PROJECT" --quiet
gcloud compute scp docker-compose.yml "$HOST:$REMOTE_DIR/" --zone="$ZONE" --project="$PROJECT" --quiet

# 4. 로드 + 기동 --------------------------------------------------------------
# 이전 이미지는 태그를 잃고 dangling 으로 남는다. 30GB 디스크가 차면 DB 가 먼저 멎으므로
# prune 으로 정리한다 - 컨테이너가 쓰는 이미지는 지워지지 않는다
say "서버에서 로드 후 재기동"
ssh_run "set -e
cd '$REMOTE_DIR'
sudo docker load -i '$TARBALL'
rm -f '$TARBALL'
sudo docker compose up -d
sudo docker image prune -f
echo '--- 상태 ---'
sudo docker compose ps
echo '--- 메모리 ---'
sudo docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}'
free -h | head -2"

# 5. 헬스체크 ----------------------------------------------------------------
# JVM + Flyway 기동에 시간이 걸린다. compose healthcheck 의 start_period 와 같은 90초를 준다
say "헬스체크 (최대 90초)"
ssh_run "for i in \$(seq 1 18); do
  code=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/health || true)
  if [ \"\$code\" = '200' ]; then echo \"OK (\${i}0초 이내)\"; exit 0; fi
  sleep 5
done
echo '헬스체크 실패 - 로그를 확인할 것: sudo docker compose logs app | tail -50'
exit 1"

say "배포 완료"
