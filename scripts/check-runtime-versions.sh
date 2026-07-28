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

  actual="$(node -v)"                       # 예 : v22.23.1
  actual="${actual#v}"; actual_major="${actual%%.*}"
  echo "node : .nvmrc=$want / 실행 중=$actual"
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
