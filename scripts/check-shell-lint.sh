#!/usr/bin/env bash
# 추적되는 셸 스크립트를 **정적 분석**한다(#145). `shellcheck` 가 구문이 아니라 **의미**를 본다.
#
# **`check-shell-syntax.sh` 와 나눈 이유** : 둘은 서로 다른 것을 잡고, 합치면 실패 신호가
# 섞여 무엇이 깨졌는지 흐려진다. `bash -n` 이 죽었으면 파일이 파싱조차 안 되는 것이고,
# 여기가 죽었으면 파싱은 되는데 의도와 다르게 도는 것이다.
#
# **이 검사가 필요한 이유는 실측으로 증명됐다.** #138 의 버그 - `check-all.sh` 의 `skip()` 이
# `printf '""N""' "$1" "$2"` 로 되어 있어 인자 둘을 조용히 버리고 리터럴만 찍었다. 그 함수가
# 존재하는 이유("건너뛴 사실을 크게 남긴다")가 정작 동작하지 않았고 문서는 사실처럼 적고
# 있었다. **`bash -n` 은 통과했고 shellcheck 만 SC2182 으로 잡는다.**
#
# **대상은 `check-shell-syntax.sh` 와 같은 규칙으로 뽑는다** - 목록을 두 곳에서 따로 관리하면
# 한쪽에만 추가되는 날이 온다. 다만 `case-floors.env` 는 뺀다. 단독으로는 셸 조각이라
# 단독으로는 shellcheck 가 셸 종류를 못 정하고, 소싱하는 쪽(`check-case-floor.sh`)이 `-x` 로 함께 본다.
#
# **`-x` 를 켠다.** 소싱되는 파일을 따라가야 `SC1091`(Not following)이 사라지고, 소싱된
# 변수까지 함께 검사된다. `check-case-floor.sh` 의 `# shellcheck source=` 지시 주석이
# 그 전제로 쓰여 있다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# **도구가 없으면 "통과"가 아니라 "모름"이다.** 이 저장소의 기존 관례를 따른다
# (`check-all.sh` 의 `skip()`). 여기서는 단독 실행도 되므로 자체적으로 안내하고 빠진다.
# 종료 코드 0 은 "검사를 안 했다"는 뜻이고, 그 사실을 호출부가 표시한다.
if ! command -v shellcheck >/dev/null 2>&1; then
	echo "shellcheck 없음 - 건너뜀. 이 항목은 \"통과\"가 아니라 \"모름\"이다" >&2
	echo "  설치 : https://github.com/koalaman/shellcheck/releases (CI 러너에는 기본 설치돼 있다)" >&2
	exit 0
fi

mapfile -t files < <(git ls-files '*.sh')

[ "${#files[@]}" -gt 0 ] || { echo "검사 대상 셸 파일을 찾지 못함" >&2; exit 1; }

# 몇 개를 봤는지 반드시 출력한다 - 대상이 0개가 되어도 "통과"로 보이는 것을 막는다
echo "셸 정적 분석 ${#files[@]}개"

# **경고를 남긴 채 통과시키지 않는다(#145).** 도입 시점에 기존 12건을 전부 처리했다
# (고침 2 · 근거 있는 억제 6 · `-x` 로 해소 1, 나머지는 배열 전환으로 사라짐).
# 하한을 두면 그 아래가 조용히 쌓여, 게이트가 빨간불이 되는 날 아무도 안 본다.
shellcheck -x "${files[@]}"

echo "셸 정적 분석 통과"
