#!/usr/bin/env bash
# 백엔드 이미지를 로컬에서 빌드해 서버로 옮기고 다시 띄운다(#127).
#
# **왜 레지스트리를 쓰지 않나** : 운영 서버에서는 빌드하지 않고(compose 본체에 build 키가 없다 -
# 서버에 빌드 도구를 들이지 않는다), 압축 후 90MB 남짓이라 그냥 넘기는 편이 단순하다. 플랜 전송량(월 4TB) 안이다.
# 레지스트리를 끼우면 인증·태그 관리·정리 정책이 따라오는데, 서버가 하나뿐이라 그 값을 못 한다.
#
# 사용법 :
#   bash scripts/deploy.sh                 # 빌드 → 전송 → 기동
#   bash scripts/deploy.sh --skip-build    # 이미 빌드된 이미지로 전송만
#   bash scripts/deploy.sh --dry-run       # 무엇을 할지만 출력
#
# 서버 접속은 일반 ssh/scp 를 쓴다(#243).
# 접속 대상은 **환경변수로 반드시 지정한다**(#133) :
#   DEPLOY_HOST (필수 - `~/.ssh/config` 의 Host 별칭) · DEPLOY_DIR (선택)
# IP · 사용자 · 키 경로는 별칭 쪽(`~/.ssh/config`)에만 둔다 - 저장소에도 명령줄에도 남기지 않는다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# **기본값을 두지 않는다(#133).** 저장소가 공개라 기본값은 곧 "내 배포 대상이 어디인지"를
# 적어 두는 것과 같다. 빈 값으로 받아 아래에서 한 번에 검사한다 - `set -u` 아래에서
# `${DEPLOY_HOST}` 로 두면 여기서 `unbound variable` 로 **안내 없이** 죽는다
HOST="${DEPLOY_HOST:-}"
# **홈 상대 경로로 둔다(#129)** - 어느 계정으로 붙든 그 홈 아래를 가리킨다
REMOTE_DIR="${DEPLOY_DIR:-deploy}"
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

# 접속 대상이 비었는지 **여기서** 본다(#133) - `--dry-run` 분기가 `preflight` 보다 먼저 끝나므로 그 안에 두면 비껴간다.
if [ -z "$HOST" ]; then
	echo "배포 대상이 지정되지 않았다. 아래 환경변수를 넣고 다시 실행할 것 :" >&2
	echo "  - DEPLOY_HOST(~/.ssh/config 의 Host 별칭)" >&2
	echo "  예) DEPLOY_HOST=… bash scripts/deploy.sh --dry-run" >&2
	exit 2
fi

# 320MB 빌드와 90MB 전송을 **다 끝낸 뒤** command not found 로 죽는 것을 막는다(#129).
# 늦고 비싼 실패를 앞으로 당긴다
preflight() {
	local missing=0
	for c in docker ssh scp gzip; do
		command -v "$c" >/dev/null 2>&1 || { echo "필요한 명령이 없다: $c" >&2; missing=1; }
	done
	[ "$missing" -eq 0 ] || exit 2
	# scp 는 대상 디렉터리를 만들어 주지 않는다. 없으면 전송 단계에서 실패한다
	ssh_run "mkdir -p '$REMOTE_DIR'"
	env_perms
	tunnel_secret
}

# **서버의 .env 권한을 600 으로 고정한다(#130).** 이 파일들에는 JWT_SECRET · OPENAI_API_KEY ·
# DB_PASSWORD 가 평문으로 있다(터널 토큰은 #203 에서 secrets/ 파일로 옮겼다 - 아래 터널 절).
# 기본 umask 로 만들면 644 가 되어 **서버에 셸이
# 닿는 누구나 읽는다** - 단일 VM 에 전부 모으는 구성이라 "호스트 셸 하나 = 전 비밀" 이 된다.
#
# **여기서 고친다.** 런북에만 적으면 사람이 기억해야만 지켜지고, 이번처럼 잊힌다.
# 권한을 좁히는 방향이라 되돌릴 피해가 없어 확인 없이 적용하되 **무엇을 바꿨는지 찍는다.**
# .env 를 보내지 않는 것(3단계 주석)과 짝을 이룬다 - 비밀은 서버에만 있고, 거기서 잠근다.
env_perms() {
	# 원격에서 도는 스크립트다. `$REMOTE_DIR` 는 **로컬에서** 펼쳐 넣고, 원격에서 펼쳐야 하는
	# 것은 `\$` 로 넘긴다 - 아래 4단계의 이미지 ID 대조가 쓰는 것과 같은 방식이다.
	ssh_run "
for f in .env backend/.env; do
  p=\"$REMOTE_DIR/\$f\"
  if [ ! -f \"\$p\" ]; then
    echo \"  경고: \$f 가 서버에 없다 - compose 기동이 실패한다\"
    continue
  fi
  mode=\$(stat -c '%a' \"\$p\" 2>/dev/null || echo '?')
  if [ \"\$mode\" = '600' ]; then
    echo \"  \$f 권한 600 (정상)\"
  else
    chmod 600 \"\$p\" && echo \"  \$f 권한 \$mode -> 600 으로 고쳤다\"
  fi
done
"
}

# **터널 토큰 파일을 확인한다(#203).** 토큰은 환경변수가 아니라 `secrets/tunnel_token` 으로 넘긴다 -
# env 는 `docker inspect` 에 평문으로 남기 때문이다. 파일이 없으면 compose 가 기동 직전에 멈추는데,
# 그때는 이미지 빌드·전송이 끝난 뒤라 늦고 비싸다. 여기서 먼저 막는다.
#
# 파일은 644 여야 한다(컨테이너 사용자 65532 가 읽는다 - compose 하단 주석). 그래서 **디렉터리를 700 으로**
# 잠근다. 좁히는 방향이라 확인 없이 고치고 무엇을 바꿨는지 찍는다 - env_perms 와 같다.
tunnel_secret() {
	ssh_run "
d=\"$REMOTE_DIR/secrets\"; f=\"\$d/tunnel_token\"
if [ ! -s \"\$f\" ]; then
  echo '  secrets/tunnel_token 이 없거나 비어 있다 - 터널이 뜨지 않는다. .env.example 의 Cloudflare Tunnel 절 참고' >&2
  exit 3
fi
mode=\$(stat -c '%a' \"\$d\")
if [ \"\$mode\" = '700' ]; then
  echo '  secrets/ 권한 700 (정상)'
else
  chmod 700 \"\$d\" && echo \"  secrets/ 권한 \$mode -> 700 으로 고쳤다\"
fi
"
}

say() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
# 명령 문자열은 **로컬에서 펼쳐 넘기는 것이 의도다** - `$REMOTE_DIR` 등은 여기서, 원격 변수는 `\$` 로 넘긴다(env_perms 주석)
# shellcheck disable=SC2029
ssh_run() { ssh "$HOST" "$1"; }

if [ "$DRY" = 1 ]; then
	cat <<EOF
호스트   $HOST
원격 경로 $REMOTE_DIR
이미지   $IMAGE
단계     $([ "$SKIP_BUILD" = 1 ] && echo '전송 → 로드 → 기동' || echo '빌드 → 저장 → 전송 → 로드 → 기동')
EOF
	exit 0
fi

# 0. 프리플라이트 ------------------------------------------------------------
# 필요한 명령과 원격 디렉터리를 **빌드 전에** 확인한다
say "사전 확인"
preflight

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
# 파일명은 바로 위에서 우리가 만든 고정값($TARBALL)이라 글롭도 특수문자도 없다.
# find 로 바꿔 얻을 것이 없다
# shellcheck disable=SC2012
ls -lh "$TMP/$TARBALL" | awk '{print "  크기: " $5}'

# 3. 전송 --------------------------------------------------------------------
# compose 파일도 같이 보낸다 - 서버의 것이 저장소보다 뒤처져 조용히 다른 설정으로 도는 사고를 막는다.
# .env 두 개는 **보내지 않는다.** 비밀이 로컬에 있을 이유가 없고, 서버에 이미 있다
say "서버로 전송"
scp -q "$TMP/$TARBALL" docker-compose.yml "$HOST:$REMOTE_DIR/"

# 4. 로드 + 기동 --------------------------------------------------------------
# **실행 중인 컨테이너가 방금 넣은 이미지를 쓰는지 확인한다(#129).** `docker compose up -d` 는
# 이미지 ID 가 같으면 컨테이너를 재생성하지 않는다. 그러면 로드도 no-op, up 도 no-op 인데
# 뒤의 헬스체크는 **옛 컨테이너가 돌려주는 200** 을 보고 즉시 성공으로 판정한다 -
# 새 코드가 한 줄도 안 올라갔는데 "배포 완료"가 찍힌다. 헬스체크가 "8080 에서 누가 200 을
# 주는가"만 보기 때문이다. 이미지 ID 를 대조해 그 구멍을 막는다.
#
# 옛 이미지 정리(prune)는 여기서 하지 않는다 - 헬스체크를 통과한 뒤로 미룬다(6단계 주석 참고).
#
# **컨테이너 ID 는 `ps -a` 로 찾는다(#252).** `ps -q` 는 실행 중인 것만 보여 주므로 새 app 이 기동 직후
# 죽으면 빈 값이 되고, `docker inspect` 가 인자 없음으로 실패해 `set -e` 로 여기서 멈춘다 - 정작 필요한
# 헬스체크 실패 출력(로그 · OOM · `:previous` 되돌리기 안내)을 못 본다. 죽은 컨테이너도 이미지 ID 는 대조되고
# 이후 헬스체크가 실패를 제대로 보고한다.
#
# **load 전에 `:previous` 태그로 롤백 지점을 만든다.** 새 이미지가 latest 를 가져가면 이전
# 것은 태그를 잃고 dangling 이 된다. 헬스체크 실패 시 되돌릴 유일한 자산인데 이름이 없으면
# 사람이 찾아 쓰기 어렵다 - 레지스트리를 안 쓰기로 한 설계의 대가다.
#
# **원격 명령 문자열 안에는 `#` 주석을 쓰지 않는다(#129).** 원격 셸이 Windows 에서 넘긴 개행을
# 어떻게 받는지 매번 보장할 수 없는데, 만약 한 줄로 합쳐지면 `#` 뒤가 전부 주석이
# 되어 **배포가 아무것도 하지 않고 성공을 반환한다.** 각 줄을 `;` 로 끝내 개행이 사라져도
# 같은 뜻이 되게 하고, 설명은 전부 이 바깥에 둔다.
say "서버에서 로드 후 재기동"
ssh_run "set -e;
cd '$REMOTE_DIR';
if sudo docker image inspect '$IMAGE' >/dev/null 2>&1; then sudo docker tag '$IMAGE' 'rag-chatbot-backend:previous'; fi;
sudo docker load -i '$TARBALL';
rm -f '$TARBALL';
want=\$(sudo docker image inspect -f '{{.Id}}' '$IMAGE');
sudo docker compose up -d;
got=\$(sudo docker inspect -f '{{.Image}}' \$(sudo docker compose ps -a -q app));
if [ \"\$want\" != \"\$got\" ]; then echo '경고: app 이 방금 넣은 이미지로 갈리지 않았다 - force-recreate 한다'; sudo docker compose up -d --force-recreate app; fi;
echo '--- 상태 ---';
sudo docker compose ps;
echo '--- 메모리 ---';
sudo docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}';
free -h | head -2"

# 5. 헬스체크 ----------------------------------------------------------------
# JVM + Flyway 기동에 시간이 걸린다. compose healthcheck 의 start_period 와 같은 90초를 준다
say "헬스체크 (최대 90초)"
ssh_run "cd '$REMOTE_DIR';
for i in \$(seq 1 18); do code=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/health || true); if [ \"\$code\" = '200' ]; then echo \"OK (\$(( (i - 1) * 5 ))초 경과)\"; exit 0; fi; sleep 5; done;
echo '=== 헬스체크 실패 ===';
sudo docker compose ps;
echo '';
echo '!! 아래 로그에는 첫 관리자 임시 비밀번호가 섞여 있을 수 있다(#103).';
echo '!! 최초 부트스트랩 직후라면 특히 그렇다. 붙여넣기 전에 확인할 것.';
sudo docker compose logs --tail=60 app;
echo '--- 종료 코드 137 이면 OOM 이다 ---';
free -h | head -2;
echo '';
echo '되돌리려면 (이전 이미지를 rag-chatbot-backend:previous 로 남겨 두었다) :';
echo \"  cd $REMOTE_DIR && sudo docker tag rag-chatbot-backend:previous $IMAGE && sudo docker compose up -d\";
exit 1"

# 6. 옛 이미지 정리 ---------------------------------------------------------
# **헬스체크가 통과한 뒤에야 옛 이미지를 버린다(#129)** - 레지스트리가 없어 서버의 옛 이미지가 유일한 롤백 자산이다.
say "옛 이미지 정리"
ssh_run "sudo docker rmi rag-chatbot-backend:previous 2>/dev/null || true;
sudo docker image prune -f"

say "배포 완료"
