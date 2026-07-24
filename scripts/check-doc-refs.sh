#!/usr/bin/env bash
# 문서 참조 실재 검사 + 볼트 위키링크 잔존 검사 (가이드 4단계 게이트)
# - 마크다운의 상대 링크가 실재하는 파일을 가리키는지 검사
# - 저장소에 [[위키링크]](볼트 문법)가 섞이지 않았는지 검사
# grep 기반(어디서나 실 바이너리) - rg 미설치 환경에서도 동작
set -euo pipefail
fail=0

# 검사 대상 - 저장소 규약이 다르면 여기만 고침. docs 경로를 코드에 박지 않음
DOC_PATHS="${DOC_PATHS:-docs README.md}"

command -v grep >/dev/null || { echo "grep 없음 - 검사 불가"; exit 1; }

# 실재하는 대상만 추림
paths=""
for p in $DOC_PATHS; do [ -e "$p" ] && paths="$paths $p"; done
[ -n "$paths" ] || { echo "검사 대상 경로가 하나도 없음 - DOC_PATHS 를 확인할 것"; exit 1; }

# 문서 참조 실재 검사 - "파일:](링크)" 형태로 수집. 링크는 그 문서 디렉터리 기준 해석
# grep -r : 파일/디렉터리 재귀, -H : 파일명, -o : 매치만, -E : 확장정규식
matches="$(grep -rHoE '\]\([^)#]+\.(md|ts|tsx|js|json|ya?ml)\)' $paths || true)"

if [ -n "$matches" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    src="${line%%:]\(*}"           # 첫 ':](' 앞까지가 파일 경로
    link="${line#*:]\(}"           # ':](' 뒤
    link="${link%\)}"              # 끝의 ) 제거
    case "$link" in http*|//*) continue ;; esac
    target="$(dirname "$src")/$link"
    [ -e "$target" ] || { echo "MISSING: $link (in $src)"; fail=1; }
  done <<< "$matches"
else
  echo "참조 링크 0건(마크다운 상대 링크 없음) - 정상"
fi

# 위키링크 잔존 검사 - 저장소에서는 해석되지 않으므로 0건이어야 함
wiki="$(grep -rHnE '\[\[[^]]+\]\]' $paths || true)"
if [ -n "$wiki" ]; then
  echo "$wiki"; echo "WIKILINK 잔존 - 볼트 문법이 저장소에 섞임"; fail=1
fi

[ "$fail" -eq 0 ] && echo "문서 참조 검사 통과"
exit $fail
