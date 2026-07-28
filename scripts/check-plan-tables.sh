#!/usr/bin/env bash
# 계획서 필수 표 검사 - 자기 신고를 실체로 바꾸는 게이트(가이드 4단계)
#  1) docs/00_계획.md 에 필수 8종 표의 헤더가 있는가
#  2) 그 표들의 데이터 행에 빈 칸이 0건이고 열 수가 헤더와 같은가
#  3) docs/ 전체 표의 열 수가 헤더와 같은가(8종 밖의 표도 같은 형태로 깨짐)
#  4) docs/01_기술선택.md 폴더 구조 표가 실제 트리와 일치하는가
#
# 표 파싱 규약(2026-07-28 리뷰 반영)
#  - 행 끝 파이프는 GFM에서 선택이므로 앞뒤 파이프를 먼저 정규화한 뒤 센다
#  - 백틱 인라인 코드 · 이스케이프(\|) 안의 파이프는 칸 구분자가 아니므로 가린다
#  - 정렬 구분선(|:---|:---:|)도 구분선으로 인식한다 - 못 걸러내면 구분선이
#    데이터 행으로 계수돼 "데이터 행 0건"을 통과시킨다
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PLAN=docs/00_계획.md
TECH=docs/01_기술선택.md
fail=0

[ -f "$PLAN" ] || { echo "검사 불가 : $PLAN 없음" >&2; exit 1; }
[ -f "$TECH" ] || { echo "검사 불가 : $TECH 없음" >&2; exit 1; }

# 표 한 덩이를 받아 열 수·빈 칸을 검사하는 공용 awk
# 인자 : label(표 이름) · src(파일 경로)
TABLE_AWK='
function normalize(line,   s, out, seg) {
  s = line
  gsub(/\\\|/, "\001", s)                 # 이스케이프된 파이프
  out = ""
  # 백틱 인라인 코드 안의 파이프를 가림. 처리한 앞부분을 out으로 덜어내며
  # 커서를 전진시킴 - 같은 자리를 다시 매치하면 루프가 끝나지 않음
  while (match(s, /`[^`]*`/)) {
    seg = substr(s, RSTART, RLENGTH)
    gsub(/\|/, "\001", seg)
    out = out substr(s, 1, RSTART - 1) seg
    s = substr(s, RSTART + RLENGTH)
  }
  s = out s
  sub(/^[[:space:]]*\|/, "", s)           # 앞 파이프
  sub(/\|[[:space:]]*$/, "", s)           # 끝 파이프(선택 사항)
  sub(/[[:space:]]+$/, "", s)
  return s
}
function is_separator(s) { return s ~ /^[[:space:]:|-]+$/ }
'

check_table() {   # stdin = 표 블록(파이프로 시작하는 행만)
  local label="$1" src="$2"
  awk -v label="$label" -v src="$src" "$TABLE_AWK"'
    {
      s = normalize($0)
      if (is_separator(s)) next
      rows++
      n = split(s, cell, "|")
      if (rows == 1) { hdr = n; next }
      if (n != hdr) {
        printf "COL-MISMATCH: %s :: %d번째 데이터 행이 %d칸(헤더 %d열) - %s\n", label, rows-1, n, hdr, src
        bad++
      }
      for (i = 1; i <= n; i++) {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", cell[i])
        if (cell[i] == "") {
          printf "EMPTY-CELL: %s :: %d번째 데이터 행의 %d번째 칸이 빔 - %s\n", label, rows-1, i, src
          empty++
        }
      }
    }
    END { printf "SUMMARY ROWS=%d EMPTY=%d BAD=%d\n", rows+0, empty+0, bad+0 }
  '
}

# 표 블록을 뽑아내는 공용 함수 - 지정한 헤딩부터 다음 헤딩(#·##)이나 수평선까지
# `###` 소제목은 표를 끊지 않음(문서 구조를 암묵 강제하지 않기 위함)
extract_table() {   # $1=헤딩 문자열 $2=파일
  awk -v want="$1" '
    $0 == want { inside = 1; next }
    inside && (/^#{1,2} / || /^---$/) { inside = 0 }
    inside && /^[[:space:]]*\|/ { print }
  ' "$2"
}

# --- 1·2) 필수 8종 표 ---------------------------------------------------------
REQUIRED_SECTIONS="제외 범위|Phase|AC|판정 이관|실측|리스크|진행 로그|게이트 체크"
IFS='|' read -ra SECTIONS <<< "$REQUIRED_SECTIONS"

for sec in "${SECTIONS[@]}"; do
  if ! grep -qxF "## $sec" "$PLAN"; then
    echo "MISSING-TABLE: '## $sec' 헤더가 $PLAN 에 없음"
    fail=1
    continue
  fi

  block="$(extract_table "## $sec" "$PLAN")"
  result="$(printf '%s\n' "$block" | check_table "표 「$sec」" "$PLAN")"

  echo "$result" | grep -vE '^SUMMARY ' || true
  summary="$(echo "$result" | grep '^SUMMARY ' | tail -1)"
  rows="$(echo "$summary" | sed 's/.*ROWS=\([0-9]*\).*/\1/')"
  empty="$(echo "$summary" | sed 's/.*EMPTY=\([0-9]*\).*/\1/')"
  badcols="$(echo "$summary" | sed 's/.*BAD=\([0-9]*\).*/\1/')"

  # 헤더 1행 + 데이터 1행 이상. 행이 0이면 `해당 없음 - 사유` 한 행을 둘 것
  if [ "$rows" -lt 2 ]; then
    echo "EMPTY-TABLE: 표 「$sec」에 데이터 행이 없음 - 행이 0이면 '해당 없음 - 사유' 한 행을 둘 것"
    fail=1
  fi
  [ "$empty" -eq 0 ] || fail=1
  [ "$badcols" -eq 0 ] || fail=1
done

# --- 3) docs/ 전체 표의 열 수 일관성 ------------------------------------------
# 열이 모자란 행은 뒤쪽 칸이 앞 칸에 뭉개져 **그 열의 값이 통째로 사라지므로**,
# `Phase 크기 판정` 같은 통과 조건 기재가 조용히 없어짐
while IFS= read -r doc; do
  out="$(awk -v f="$doc" "$TABLE_AWK"'
    /^[[:space:]]*\|/ {
      s = normalize($0)
      if (is_separator(s)) next
      n = split(s, cell, "|")
      if (!intable) { intable = 1; hdr = n; hdrline = NR; next }
      if (n != hdr) printf "COL-MISMATCH: %s:%d 행이 %d칸(헤더 %d열, %d행)\n", f, NR, n, hdr, hdrline
      next
    }
    { intable = 0 }
  ' "$doc")"
  [ -z "$out" ] || { echo "$out"; fail=1; }
done <<< "$(find docs -name '*.md' | sort)"

# --- 4) 폴더 구조 표 대조 -----------------------------------------------------
DEFAULTS="
frontend/src/pages:src/pages/
frontend/src/components:src/components/
frontend/src/hooks:src/hooks/
frontend/src/api:src/api/
frontend/src/utils:src/utils/
frontend/src/types:src/types/
frontend/src/styles:src/styles/
frontend/public:frontend/public
frontend/.env.example:.env.example
backend/src/main/java/com/ragchatbot/config:config/
backend/src/main/java/com/ragchatbot/controller:controller/
backend/src/main/java/com/ragchatbot/service:service/
backend/src/main/java/com/ragchatbot/repository:repository/
backend/src/main/java/com/ragchatbot/entity:entity/
backend/src/main/java/com/ragchatbot/dto:dto/
backend/src/main/java/com/ragchatbot/exception:exception/
backend/src/main/java/com/ragchatbot/security:security/
backend/src/main/java/com/ragchatbot/client:client/
"

table="$(extract_table '## 1-A 폴더 구조 표' "$TECH")"
[ -n "$table" ] || { echo "검사 불가 : $TECH 에서 '## 1-A 폴더 구조 표'를 못 찾음" >&2; exit 1; }

# 이 표도 빈 칸 · 열 수 검사 대상임(사유 칸이 비면 "사유를 적었다"가 거짓이 됨)
result="$(printf '%s\n' "$table" | check_table "표 「1-A 폴더 구조」" "$TECH")"
echo "$result" | grep -vE '^SUMMARY ' || true
summary="$(echo "$result" | grep '^SUMMARY ' | tail -1)"
[ "$(echo "$summary" | sed 's/.*EMPTY=\([0-9]*\).*/\1/')" -eq 0 ] || fail=1
[ "$(echo "$summary" | sed 's/.*BAD=\([0-9]*\).*/\1/')" -eq 0 ] || fail=1

while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  path="${entry%%:*}"; token="${entry##*:}"
  # 토큰은 **첫 칸(영역 열)** 에서만 찾음 - 표 전체에서 찾으면 다른 행 본문에
  # 우연히 등장한 문자열이 사유 행을 대신해, 행을 지워도 통과함
  row="$(printf '%s\n' "$table" | awk -F'|' -v t="$token" 'index($2, t) > 0')"

  if [ -e "$path" ]; then
    if printf '%s\n' "$row" | grep -q '미생성'; then
      echo "STALE: $path 이 실재하는데 폴더 구조 표는 '미생성'이라 적음"
      fail=1
    fi
  else
    if [ -z "$row" ]; then
      echo "MISSING-REASON: 기본 폴더 $path 이 없는데 폴더 구조 표 첫 칸에 사유 행이 없음(토큰 '$token')"
      fail=1
    fi
  fi
done <<< "$DEFAULTS"

if [ "$fail" -eq 0 ]; then
  echo "OK: 필수 8종 표 빈 칸·열 수 이상 0건 · docs 전체 표 열 수 일치 · 폴더 구조 표가 실제 트리와 일치"
fi
exit $fail
