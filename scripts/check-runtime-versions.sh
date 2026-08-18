#!/usr/bin/env bash
# 런타임 버전 대조 게이트 - 0-A에서 4단계로 이관된 통과 조건(이관-8)
#   "런타임 버전 파일의 값과 CI 러너가 실제로 쓴 버전이 같음"
# 문서에 로그를 옮겨 적는 대신 러너에서 직접 재서 판정함
# 사용 : check-runtime-versions.sh node | java
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

target="${1:-}"
case "$target" in
  node|java) ;;
  *) echo "사용법 : $0 node|java"; exit 1 ;;
esac

if [ "$target" = node ]; then
  [ -f .nvmrc ] || { echo "수집 실패 : .nvmrc 없음"; exit 1; }
  want="$(tr -d ' \t\r\n' < .nvmrc)"
  [ -n "$want" ] || { echo "수집 실패 : .nvmrc가 비어 있음"; exit 1; }
  want="${want#v}"; want_major="${want%%.*}"

  # 배포 런타임도 같이 대조함 - Vercel 은 .nvmrc 를 읽지 않고
  # frontend/package.json 의 engines.node 로 빌드함. 이 둘이 갈리면
  # CI 가 검증한 버전과 실제 배포 산출물을 만든 버전이 달라짐
  pkg=frontend/package.json
  [ -f "$pkg" ] || { echo "수집 실패 : $pkg 없음"; exit 1; }
  engines="$(node -p "JSON.parse(require('fs').readFileSync('$pkg','utf8')).engines?.node ?? ''")"
  [ -n "$engines" ] || { echo "수집 실패 : $pkg 에 engines.node 가 없음"; exit 1; }
  engines_major="${engines%%.*}"

  actual="$(node -v)"                       # 예 : v24.19.0
  actual="${actual#v}"; actual_major="${actual%%.*}"
  echo "node : .nvmrc=$want / engines.node=$engines / 실행 중=$actual"

  if [ "$engines_major" != "$want_major" ]; then
    echo "FAIL: .nvmrc 메이저($want_major)와 engines.node 메이저($engines_major)가 다름"
    echo "      Vercel 은 engines.node 로 빌드함 - 여기가 갈리면 배포만 조용히 다른 런타임을 씀"
    exit 1
  fi
else
  want="$(grep -o '<java\.version>[0-9]\+</java\.version>' backend/pom.xml | grep -o '[0-9]\+' || true)"
  [ -n "$want" ] || { echo "수집 실패 : backend/pom.xml 에서 java.version 을 못 찾음"; exit 1; }
  want_major="$want"

  # java -version 은 stderr 로 나오고 형식이 배포판마다 다름(17.0.19 · 1.8.0_402)
  raw="$(java -version 2>&1 | head -1)"
  actual="$(printf '%s' "$raw" | grep -o '"[0-9][^"]*"' | tr -d '"' || true)"
  [ -n "$actual" ] || { echo "수집 실패 : java -version 출력에서 버전을 못 뽑음 - $raw"; exit 1; }
  case "$actual" in
    1.*) actual_major="$(printf '%s' "$actual" | cut -d. -f2)" ;;   # 1.8.0_x → 8
    *)   actual_major="${actual%%.*}" ;;
  esac
  echo "java : pom.xml java.version=$want / 실행 중=$actual"
fi

if [ "$actual_major" != "$want_major" ]; then
  echo "FAIL: 선언한 런타임 메이저($want_major)와 실제 실행 중인 메이저($actual_major)가 다름"
  echo "      버전 파일을 고치거나 CI 설정을 고칠 것 - 둘 중 하나는 거짓말임"
  exit 1
fi
echo "OK"
