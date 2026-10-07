#!/usr/bin/env bash
# DB·첨부를 GCS 로 백업한다(#132). **서버에서 돈다** - 매일 cron 이 부르고, 사람이 직접 불러도 된다.
#
# **왜 이 모양인가**
# - 단일 VM · 단일 디스크라 같은 디스크의 사본은 디스크 사고에 무용하다. 그래서 밖(GCS)에 둔다
# - VM 기본 서비스 계정의 저장소 권한이 **읽기 전용**이고, 바꾸려면 VM 을 멈춰야 한다
#   (2026-09-30 이 존에서 자원 부족으로 재기동이 12회 연속 실패했다). 그래서 **버킷 하나에
#   쓰기만 되는**(`roles/storage.objectCreator`) 전용 키를 쓴다 - 키가 새도 백업을 읽거나 지울 수 없다
# - 쓰기만 되므로 **같은 이름을 덮어쓸 수 없다**(덮어쓰기는 삭제 권한이 필요하다). 객체 이름에 시각을 넣는다
# - 오래된 백업은 버킷 수명주기(14일)가 지운다. 이 스크립트는 지우지 않는다 - 지울 권한이 없다
#
# 사용법 (서버의 배포 디렉터리 기준) :
#   bash backup.sh                  # 지금 한 번 백업
#   bash backup.sh --install-cron   # 매일 04:00(서버 시간대) cron 등록 - 여러 번 불러도 한 줄
#
# 설정은 `backup/backup.env` 에 둔다. **버킷 이름은 저장소에 두지 않는다**(#133 과 같은 이유) :
#   BACKUP_BUCKET=gs://…            (필수)
#   BACKUP_KEY_FILE=backup/sa-key.json   (선택, 기본값. 권한 600 이어야 한다)
set -euo pipefail
# cron 의 PATH 는 /usr/bin:/bin 뿐이다 - gcloud 는 snap 으로 깔려 /snap/bin 에 있다
export PATH="$PATH:/usr/local/bin:/snap/bin"
# 덤프 · gcloud 자격증명 캐시 등 여기서 만드는 파일은 전부 본인만 읽게 한다
umask 077

# 스크립트가 놓인 곳이 배포 디렉터리다 - cron 은 홈에서 부르므로 cwd 를 믿지 않는다
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

CONF="backup/backup.env"
LOG="backup/backup.log"

say() { printf '%s %s\n' "$(date '+%F %T %Z')" "$1"; }
die() { say "실패: $1" >&2; exit 1; }

install_cron() {
	local line="0 4 * * * bash $DIR/backup.sh >> $DIR/$LOG 2>&1"
	# 이 스크립트를 부르는 줄은 전부 지우고 한 줄만 넣는다 - 경로가 바뀌어도 두 줄이 되지 않는다
	{ crontab -l 2>/dev/null | grep -vF "backup.sh" || true; echo "$line"; } | crontab -
	say "cron 등록: $line"
}

case "${1:-}" in
	--install-cron) install_cron; exit 0 ;;
	"") ;;
	*) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
esac

# 0. 프리플라이트 ------------------------------------------------------------
# 빠진 것을 한 번에 모아 알린다 - deploy.sh 와 같은 규약
missing=()
for c in docker gcloud curl gzip sha256sum flock; do
	command -v "$c" >/dev/null 2>&1 || missing+=("명령 $c")
done
[ -f "$CONF" ] || missing+=("설정 파일 $DIR/$CONF (BACKUP_BUCKET=gs://…)")
if [ "${#missing[@]}" -ne 0 ]; then
	for m in "${missing[@]}"; do say "없음: $m" >&2; done
	exit 2
fi
# shellcheck source=/dev/null
. "$CONF"
BUCKET="${BACKUP_BUCKET:-}"
KEY="${BACKUP_KEY_FILE:-backup/sa-key.json}"
[ -n "$BUCKET" ] || die "$CONF 에 BACKUP_BUCKET 이 비어 있다"
[ -f "$KEY" ] || die "키 파일이 없다: $DIR/$KEY"
# 키 권한이 넓으면 고치지 않고 멈춘다 - deploy.sh 의 .env 와 달리 이 키는 사람이 직접 넣은 것이라,
# 넓어진 이유를 모른 채 조용히 좁히면 누가 읽었을 수 있다는 사실이 묻힌다
mode="$(stat -c '%a' "$KEY")"
[ "$mode" = "600" ] || die "키 파일 권한이 $mode 다(600 이어야 한다): $DIR/$KEY"

# 두 번 겹쳐 돌지 않게 한다 - 사람이 부른 것과 cron 이 겹치는 경우
exec 9>"backup/.lock"
flock -n 9 || die "다른 백업이 돌고 있다"

STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. DB ----------------------------------------------------------------------
# -Fc : 압축된 사용자 지정 형식. pg_restore 로 표 단위 복구가 되고 --list 로 무결성을 볼 수 있다
say "DB 덤프"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$TMP/db-$STAMP.dump"
[ -s "$TMP/db-$STAMP.dump" ] || die "덤프가 비어 있다"
# 덤프를 다시 읽어 목차가 나오는지 본다 - 잘린 파일을 백업이라 부르지 않기 위함
docker compose exec -T db pg_restore --list < "$TMP/db-$STAMP.dump" > /dev/null || die "덤프 목차를 읽지 못했다"

# 2. 첨부 --------------------------------------------------------------------
# app 은 read_only 지만 읽기는 된다. app 이미지에 gzip 이 없어 압축은 여기서 한다
say "첨부 묶기"
docker compose exec -T app tar -C /data/uploads -cf - . | gzip -c > "$TMP/uploads-$STAMP.tar.gz"
tar -tzf "$TMP/uploads-$STAMP.tar.gz" > /dev/null || die "첨부 묶음을 읽지 못했다"

( cd "$TMP" && sha256sum ./* > "SHA256SUMS-$STAMP" )

# 3. 업로드 ------------------------------------------------------------------
# **설정 디렉터리를 격리한다.** 서버의 기본 gcloud 설정(사람이 쓰는 계정)을 이 키로 바꿔 놓지 않는다
export CLOUDSDK_CONFIG="$DIR/backup/.gcloud"
gcloud auth activate-service-account --key-file="$KEY" --quiet > /dev/null 2>&1 	|| die "서비스 계정 키로 인증하지 못했다"
TOKEN="$(gcloud auth print-access-token)"
# **gcloud storage cp 를 쓰지 않는다.** 올리기 전에 대상 객체를 읽어 보는데(objects.get), 쓰기 전용 키에는
# 그 권한이 없어 어떤 플래그를 줘도 403 으로 멎는다(2026-10-06 실측). JSON API 로 직접 올리면 objects.create 만 쓴다.
# ifGenerationMatch=0 : 같은 이름이 이미 있으면 덮지 않고 실패한다 - 이름에 시각이 있어 정상이면 일어나지 않는다
NAME_BUCKET="${BUCKET#gs://}"
say "업로드 → $BUCKET/$STAMP/"
for f in "$TMP"/*; do
	obj="$STAMP%2F$(basename "$f")"
	curl -sSf -o /dev/null -X POST 		-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/octet-stream" 		--data-binary "@$f" 		"https://storage.googleapis.com/upload/storage/v1/b/$NAME_BUCKET/o?uploadType=media&ifGenerationMatch=0&name=$obj" 		|| die "업로드 실패: $(basename "$f")"
done

say "완료 $(du -cb "$TMP"/* | tail -1 | cut -f1) bytes · $(find "$TMP" -type f | wc -l) 파일"
