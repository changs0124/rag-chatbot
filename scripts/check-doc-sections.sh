#!/usr/bin/env bash
# 문서의 섹션 이름 참조 ↔ 대상 파일 헤딩 대조 (가이드 4단계 게이트)
#
# 왜 필요한가 : `check-doc-refs.sh` 는 **경로의 실재**만 본다. #28 에서 `backend.md` 가 `frontend.md` 의
# 없는 섹션(「데이터·오류」)을 가리켰는데 게이트가 통과했고 사람이 눈으로 찾았다. `check-doc-versions.sh`
# (#52)는 **버전 주장**을 본다 - 원인이 다르다. 그쪽은 *낡은 값*, 이쪽은 *깨진 참조*다.
#
# 무엇을 잡나 : **파일 참조가 바로 앞에 붙은** 「섹션」이 대상 파일의 헤딩에 없는 것.
#   `backend.md` 「배포」            ← 백틱 파일명
#   [backend](./backend.md) 「배포」  ← 마크다운 링크
#
# 무엇을 못 잡나 - 아래 셋은 **일부러 제외한다.** 억지로 잡으려다 오탐이 나면 게이트가 무시당하고,
# 그러면 잡히던 것까지 못 잡는다(#52 에서 같은 판단을 했다).
#   - 같은 문서 안 참조 : "이 표 아래 「API 목록」" — 대상 파일이 없어 해석할 수 없다
#   - 별명으로 부르는 것 : "백로그 「파일 URL 수명」" — 경로가 아니라 사람 말이다
#   - 섹션이 아닌 강조  : 「자료 없음」(UI 배너 이름) — 「」 는 한국어에서 강조 부호로도 쓴다
#   - **파일 참조와 「 사이에 다른 텍스트가 끼는 것** : `backend.md:222` 의
#     `[features.md](…) FEAT-ADMIN-002 「soft delete 를 쓰는 이유」` 가 그렇다. 아래 PATTERN 이
#     둘 사이에 공백만 허용해서 **조용히 수집에서 빠진다.** 넓히면 이번엔 오탐이 난다 - 그 대상은
#     `features.md:302` 에서 헤딩이 아니라 **굵은글씨**라, 잡으려면 has_section() 도 굵은 라벨을
#     보도록 넓혀야 한다. 근거가 이 한 건뿐이라 지금은 넓히지 않는다(#65 에서 판단)
#   - `docs/06_changelog/**` — 이력 서술이라 당시 이름이 맞다
#
# 헤딩 접미를 견딘다 : 문서가 「배포」라 적고 실제 헤딩이 `## 배포 (Vercel)` 인 경우가 있다.
# 정확 일치만 보면 오탐이 나므로 **헤딩이 섹션 이름으로 시작하면 통과**로 본다.
#
# grep 기반이다 - `docs` CI 잡은 checkout 과 bash 뿐이라 node·JDK 가 없다(check-doc-refs.sh 와 같은 제약).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

DOC_PATHS="${DOC_PATHS:-docs README.md}"
fail=0
checked=0

# **배열로 받는다(#145).** 문자열에 이어 붙이면 아래 호출부마다 따옴표 없이 전개해야 하고
# (shellcheck SC2086), 경로에 공백이 있으면 조각난다. 배열이면 "${paths[@]}" 로 안전하다
paths=()
for p in $DOC_PATHS; do [ -e "$p" ] && paths+=("$p"); done
[ "${#paths[@]}" -gt 0 ] || { echo "검사 대상 경로가 하나도 없음 - DOC_PATHS 를 확인할 것" >&2; exit 1; }

# `a/b/../c` 같은 경로를 눕힘. realpath 가 없는 환경도 있어 직접 처리함
normalize() {
	local out=() seg
	local IFS='/'
	read -ra segs <<< "$1"
	for seg in "${segs[@]}"; do
		case "$seg" in
			''|.) ;;
			..) [ ${#out[@]} -gt 0 ] && unset 'out[${#out[@]}-1]' ;;
			*) out+=("$seg") ;;
		esac
	done
	echo "${out[*]}"
}

# 참조를 실제 파일 경로로 해석. 셋 다 실패하면 빈 문자열
resolve() {
	local from_dir="$1" ref="$2" cand
	ref="${ref%%#*}"                       # 앵커 제거
	if [ -z "$ref" ]; then echo ""; return; fi

	case "$ref" in
		*/*)                                 # 경로가 들어 있음
			cand="$(normalize "$from_dir/$ref")"
			[ -f "$cand" ] && { echo "$cand"; return; }
			cand="$(normalize "$ref")"        # 저장소 루트 기준으로도 시도
			[ -f "$cand" ] && { echo "$cand"; return; }
			;;
		*)                                   # 파일명만 - 같은 폴더 먼저
			[ -f "$from_dir/$ref" ] && { echo "$from_dir/$ref"; return; }
			# docs 안에서 파일명이 유일하면 그것으로 본다. 여럿이면 해석하지 않는다
			local hits
			hits="$(find docs -name "$ref" -type f 2>/dev/null)"
			[ "$(printf '%s\n' "$hits" | grep -c .)" = 1 ] && { echo "$hits"; return; }
			;;
	esac
	echo ""
}

# 헤딩 목록. `#` 과 **번호 접두**(`## 2. API 목록`)를 벗김 - api.md 는 절에 번호를 매기는데
# 참조하는 쪽은 「API 목록」이라고만 적는다. 표기가 문서마다 달라 여기서 맞춰 준다
headings() {
	grep -E '^#{1,6} ' "$1" | sed -e 's/^#\{1,6\}[[:space:]]*//' -e 's/^[0-9]\+\.[[:space:]]*//'
}

# 대상 파일에 그 섹션이 있나. 헤딩이 이름으로 시작하면 통과 - `## 배포 (Vercel)` 같은 접미를 견딤
has_section() {
	local file="$1" want="$2" h
	while IFS= read -r h; do
		[ "$h" = "$want" ] && return 0
		case "$h" in "$want "*|"$want("*) return 0 ;; esac
	done < <(headings "$file")
	return 1
}

# 「…」 바로 앞에 파일 참조가 붙은 것만 수집.
#
# **`[^」]` 를 쓰지 않는다.** 로케일이 C 인 환경에서 grep 은 멀티바이트를 바이트로 다루므로,
# 부정 문자클래스에 「 · 」 같은 세 바이트 문자를 넣으면 그 바이트가 다른 한글에도 들어 있어
# 멀쩡한 줄이 매칭에서 빠진다(예: `데이터` 의 한 바이트가 `」` 의 한 바이트와 겹친다).
# 실제로 그렇게 **조용히 통과했다.** 그래서 여기서는 줄 끝까지 욕심껏 잡고, 섹션 이름은 아래에서
# 셸 파라미터 확장으로 잘라낸다 - 그쪽은 바이트 안전하다.
#
# 한계 : 한 줄에 이런 참조가 둘이면 첫 번째만 본다. 현재 문서에는 그런 줄이 없다.
# 위와 같다 - 백틱을 리터럴로 찾는 정규식이라 단일 따옴표가 의도다
# shellcheck disable=SC2016
PATTERN='(\[[^]]*\]\([^)]+\.md[^)]*\)|`[^`]+\.md`)[[:space:]]*「.*'
matches="$(grep -rHnoE "$PATTERN" "${paths[@]}" --include='*.md' 2>/dev/null \
	| grep -v '^docs/06_changelog/' || true)"

if [ -n "$matches" ]; then
	while IFS= read -r hit; do
		[ -n "$hit" ] || continue
		src="${hit%%:*}"; rest="${hit#*:}"; line="${rest%%:*}"; text="${rest#*:}"

		# 첫 「 뒤부터 첫 」 앞까지. 파라미터 확장이라 로케일과 무관하게 안전하다
		section="${text#*「}"
		section="${section%%」*}"
		[ "$section" = "$text" ] && { echo "FAIL: $src:$line — 「」 짝을 찾지 못함"; fail=1; continue; }
		if printf '%s' "$text" | grep -q '^\['; then
			ref="$(printf '%s' "$text" | sed 's/^\[[^]]*\](\([^)]*\)).*/\1/')"
		else
			# sed 스크립트 안의 백틱도 리터럴이다 - 단일 따옴표가 의도다
			# shellcheck disable=SC2016
			ref="$(printf '%s' "$text" | sed 's/^`\([^`]*\)`.*/\1/')"
		fi

		target="$(resolve "$(dirname "$src")" "$ref")"
		if [ -z "$target" ]; then
			echo "FAIL: $src:$line — 참조한 파일을 찾지 못함: '$ref'"
			fail=1
			continue
		fi

		checked=$((checked + 1))
		if ! has_section "$target" "$section"; then
			echo "FAIL: $src:$line — $target 에 「$section」 헤딩이 없음"
			echo "      있는 헤딩: $(headings "$target" | paste -sd' · ' -)"
			fail=1
		fi
	done <<< "$matches"
fi

# 대상을 실제로 수집했는지 단언 - 빈 목록을 돌며 조용히 통과하는 형태를 막음
[ "$checked" -gt 0 ] || { echo "수집 실패 : 검사할 섹션 참조를 한 건도 못 찾음 - 패턴을 확인할 것" >&2; exit 1; }

echo "섹션 참조 $checked 건 대조"
if [ "$fail" -ne 0 ]; then
	echo "문서가 가리키는 섹션이 대상 파일에 없음 - 위 줄을 고칠 것" >&2
	exit 1
fi
echo "섹션 참조 검사 통과"
