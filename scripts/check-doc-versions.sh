#!/usr/bin/env bash
# 문서가 주장하는 버전 ↔ 실제 해석된 버전 대조 (가이드 4단계 게이트)
#
# 왜 필요한가 : 이 저장소는 문서를 정본으로 쓰고 `INDEX.md` 기술 스택 표 · `backend.md` 머리줄 ·
# `overview.md` 가 전부 버전을 주장한다. 그런데 **그 값이 사실인지는 어떤 게이트도 보지 않았다.**
# #48(Spring Boot 4.1 업그레이드)에서 `INDEX.md` 의 `JUnit 5` 가 실제 6.0.3 과 어긋난 채 남았는데
# 게이트 넷이 전부 초록이었다(#51 에서 사람이 눈으로 찾아 고침, #52 에서 이 스크립트를 만듦).
#
# 무엇을 잡나 : 아래 NAMES 표에 있는 이름 뒤에 붙은 버전 숫자가 실제와 어긋나는 것.
# 무엇을 못 잡나
#   - 표에 없는 라이브러리. 검사 대상을 늘리려면 NAMES 에 줄을 추가한다
#   - 이름 없이 숫자만 적힌 서술("4.1 로 올렸다"). 이름에 붙어 있어야 잡는다
#   - `docs/06_changelog/**` — 이력 서술이라 당시 값이 맞다. 일부러 제외한다
#   - 버전을 아예 안 적은 서술("Spring Boot + Java 17" 의 Spring Boot). 없는 주장은 틀릴 수 없다
#
# 왜 backend CI 잡에 붙나 : JUnit 은 `pom.xml` 에 없고 **Spring Boot BOM 이 관리**한다. BOM 을 읽으려면
# 로컬 m2 저장소가 채워져 있어야 하므로 `./mvnw verify` 뒤에 돌려야 한다. `docs` 잡은 checkout 과 bash
# 뿐이라 여기 붙이면 정작 잡아야 할 것을 못 잡는다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

POM=backend/pom.xml
PKG=frontend/package.json
fail=0

die() { echo "수집 실패 : $*" >&2; exit 1; }

[ -f "$POM" ] || die "$POM 없음"
[ -f "$PKG" ] || die "$PKG 없음"

# --- 실제 값 수집 --------------------------------------------------------
# pom 을 한 줄로 눕히고 태그 사이 여백을 지움 - 들여쓰기가 탭이라 개행만 지우면 태그가 안 붙는다
pom_flat() {
	tr -d '\r\n\t ' < "$POM"
}

# <parent> 블록의 첫 <version>
pom_parent_version() {
	pom_flat | grep -o '<parent>.*</parent>' | grep -o '<version>[^<]*' | head -1 | sed 's/<version>//'
}

# artifactId 바로 뒤에 오는 <version>
pom_dep_version() {
	pom_flat | grep -o "<artifactId>$1</artifactId><version>[^<]*" | head -1 | sed 's/.*<version>//'
}

pom_property() {
	grep -o "<$1>[^<]*" "$POM" | head -1 | sed "s/<$1>//"
}

# package.json 의 dependencies/devDependencies 에서 범위 접두(^ ~ >= 등)를 뗀 값
pkg_version() {
	node -e '
		const p = require("./frontend/package.json");
		const d = { ...(p.dependencies || {}), ...(p.devDependencies || {}) };
		const v = d[process.argv[1]];
		if (!v) { console.error("수집 실패 : package.json 에 " + process.argv[1] + " 없음"); process.exit(1); }
		console.log(String(v).replace(/^[^0-9]*/, ""));
	' "$1"
}

# Spring Boot BOM 이 관리하는 버전. m2 의 spring-boot-dependencies pom 을 직접 읽음
bom_property() {
	local boot="$1" prop="$2"
	local bom="${M2_REPO:-$HOME/.m2/repository}/org/springframework/boot/spring-boot-dependencies/$boot/spring-boot-dependencies-$boot.pom"
	[ -f "$bom" ] || die "BOM 을 못 찾음 : $bom
      backend 빌드를 먼저 돌려 m2 를 채울 것 — cd backend && ./mvnw -B verify"
	grep -o "<$prop>[^<]*" "$bom" | head -1 | sed "s/<$prop>//"
}

BOOT="$(pom_parent_version)"
[ -n "$BOOT" ] || die "$POM 에서 parent version 을 못 찾음"

# --- 검사표 -------------------------------------------------------------
# "문서 표기|실제 값"  — **긴 이름을 먼저** 둔다. `React` 가 앞에 오면 `React Router 8` 을
# `React 8` 로 잘못 읽어 오탐이 난다. 아래 순서가 곧 매칭 우선순위다.
NAMES=$(cat <<ENTRIES
React Router|$(pkg_version react-router)
Tailwind CSS|$(pkg_version tailwindcss)
Spring Boot|$BOOT
TypeScript|$(pkg_version typescript)
Tailwind|$(pkg_version tailwindcss)
MyBatis|$(pom_dep_version mybatis-spring-boot-starter)
JUnit|$(bom_property "$BOOT" junit-jupiter.version)
React|$(pkg_version react)
Vite|$(pkg_version vite)
Java|$(pom_property java.version)
ENTRIES
)

# --- 대조 ---------------------------------------------------------------
# 문서 값이 실제 값의 **접두**면 통과. 문서는 메이저만 적기도 한다(React 19 / Spring Boot 4.1)
is_prefix() {
	awk -v doc="$1" -v act="$2" '
		BEGIN {
			dn = split(doc, d, ".");
			split(act, a, ".");
			for (i = 1; i <= dn; i++) if (d[i] != a[i]) { print "no"; exit }
			print "yes"
		}'
}

scanned=0
while IFS='|' read -r name actual; do
	[ -n "$name" ] || continue
	[ -n "$actual" ] || die "$name 의 실제 버전을 수집하지 못함"

	# docs/ 와 README.md 에서 "<이름> <숫자>" 를 찾음. CHANGELOG 는 이력이라 제외
	hits="$(grep -rHnoE "${name}[[:space:]]+v?[0-9]+(\.[0-9]+)*" docs README.md \
		--exclude-dir=06_changelog 2>/dev/null || true)"
	[ -n "$hits" ] || continue

	while IFS= read -r hit; do
		[ -n "$hit" ] || continue
		where="${hit%%:*}"; rest="${hit#*:}"; line="${rest%%:*}"
		doc_ver="$(printf '%s' "$hit" | grep -oE '[0-9]+(\.[0-9]+)*$')"
		scanned=$((scanned + 1))
		if [ "$(is_prefix "$doc_ver" "$actual")" != yes ]; then
			echo "FAIL: $where:$line — 문서는 '$name $doc_ver' 인데 실제는 $actual"
			fail=1
		fi
	done <<< "$hits"
done <<< "$NAMES"

[ "$scanned" -gt 0 ] || die "버전 주장을 한 건도 못 찾음 - 검사표나 대상 경로를 확인할 것"

echo "문서 버전 주장 $scanned 건 대조"
if [ "$fail" -ne 0 ]; then
	echo "문서가 주장하는 버전이 실제와 다름 - 위 줄을 고칠 것" >&2
	exit 1
fi
echo "문서 버전 대조 통과"
