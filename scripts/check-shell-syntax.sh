#!/usr/bin/env bash
# 추적되는 셸 스크립트의 **구문**을 검사한다(#136). `bash -n` 은 파싱만 하고 실행하지 않는다.
#
# **왜 필요한가** : 이 저장소의 품질 게이트는 `scripts/check-*.sh` 가 만든다. 그런데 정작
# 그 스크립트들을 보는 게이트가 하나도 없었다 - 게이트를 만드는 코드가 아무 게이트도 받지
# 않는 상태였다. `scripts/deploy.sh` 는 특히 위험하다(`docs/04_tasks/backlog.md` 기준
# **통짜로 실행된 적이 없다**). 구문 오류가 있어도 실제 배포를 시도하는 순간에야 드러난다.
#
# **목록을 손으로 관리하지 않는다.** `git ls-files` 로 산출하므로 새 스크립트가 저절로
# 포함된다. 상수로 개수를 박아 두면 스크립트를 하나 더할 때마다 같이 고쳐야 하고,
# 안 고치면 **새 파일만 조용히 빠진다** - 게이트가 막으려던 상황이 게이트 안에서 재현된다.
#
# **`bash -n` 이 잡지 못하는 것** : 구문이 맞으면 통과한다. 의미 오류는 `shellcheck` 의
# 몫이다 - 실제로 #138 의 버그(`printf '""N""' "$1" "$2"` 가 인자를 버리던 것)는 `bash -n`
# 을 통과했고 shellcheck 만 SC2183 으로 잡았다. shellcheck 도입 여부는 별건이다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# `.sh` 확장자가 아닌 셸 조각도 넣는다. `case-floors.env` 는 `check-case-floor.sh` 가
# `.` 으로 읽으므로, 여기 구문 오류가 나면 그 게이트가 통째로 깨진다.
mapfile -t files < <(git ls-files '*.sh' 'scripts/case-floors.env')

[ "${#files[@]}" -gt 0 ] || { echo "검사 대상 셸 파일을 찾지 못함" >&2; exit 1; }

fail=0
for f in "${files[@]}"; do
	if ! err="$(bash -n "$f" 2>&1)"; then
		printf '구문 오류 : %s\n%s\n' "$f" "$err" >&2
		fail=$((fail + 1))
	fi
done

# **몇 개를 봤는지 반드시 출력한다.** 대상이 0개가 되어도 "통과"로 보이는 것을 막는다 -
# 이 검사가 존재하는 이유가 "조용히 빠지는 것"을 막는 것이기 때문이다.
echo "셸 구문 검사 ${#files[@]}개"

if [ "$fail" -ne 0 ]; then
	echo "구문 오류 ${fail}건" >&2
	exit 1
fi

echo "셸 구문 검사 통과"
