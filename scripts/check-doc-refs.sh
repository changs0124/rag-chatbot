#!/usr/bin/env bash
# 문서 참조 실재 검사 + 볼트 위키링크 잔존 검사 (가이드 4단계 게이트)
# - 마크다운 링크가 실재하는 파일을 가리키는지 검사(앵커 · 타이틀 · 꺾쇠 · 참조형 · <img src> 포함)
# - **백틱으로 적은 저장소 경로**(`docs/…` · `scripts/…` · `backend/…` · `frontend/…` · `.github/…`)도 검사
#   2026-07-28 추가 : 이 저장소는 문서 상호 참조를 대부분 백틱으로 적어, 링크만 보던 이전 판은
#   `docs/02_운영.md`가 없는 상태를 초록으로 통과시켰음(게이트 사각지대)
# - 저장소에 [[위키링크]](볼트 문법)가 섞이지 않았는지 검사
# grep 기반(어디서나 실 바이너리) - rg 미설치 환경에서도 동작
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail=0

# 검사 대상 - 저장소 규약이 다르면 여기만 고침. docs 경로를 코드에 박지 않음
DOC_PATHS="${DOC_PATHS:-docs README.md}"
EXT='md|mdx|ts|tsx|js|jsx|mjs|cjs|json|ya?ml|java|kt|py|sql|sh|xml|css|html?|txt|png|jpe?g|gif|svg|webp|env|toml'

command -v grep >/dev/null || { echo "grep 없음 - 검사 불가"; exit 1; }

paths=""
for p in $DOC_PATHS; do [ -e "$p" ] && paths="$paths $p"; done
[ -n "$paths" ] || { echo "검사 대상 경로가 하나도 없음 - DOC_PATHS 를 확인할 것"; exit 1; }

# --- 수집 ---------------------------------------------------------------
# 1) 마크다운 링크 · 참조형 정의 · <img src>. 앵커(#) · 타이틀(" ") · 꺾쇠(< >)가 붙은 형태까지
md_links="$(grep -rHoE "(\]\(<?|\]:[[:space:]]+|src=\")[^)\"#<>[:space:]]+\.($EXT)" $paths || true)"
# 2) 백틱으로 적은 저장소 경로 - 최상위 디렉터리로 시작하는 것만(상대 경로 오탐 방지)
bt_links="$(grep -rHoE '`(docs|scripts|backend|frontend|\.github)/[^`[:space:]]+`' $paths || true)"

links=""
[ -n "$md_links" ] && links="$md_links"
[ -n "$bt_links" ] && links="$links
$bt_links"

# 대상을 실제로 수집했는지 먼저 단언함 - 빈 목록을 돌며 조용히 통과하는 형태를 막음(가이드)
[ -n "$links" ] || { echo "참조를 한 건도 수집하지 못함 - 경로 · 패턴부터 의심할 것"; exit 1; }

collected=0
checked=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  src="${line%%:*}"                       # 첫 콜론까지가 파일 경로(문서 경로에 콜론을 쓰지 않는 것을 전제)
  raw="${line#*:}"
  collected=$((collected + 1))

  case "$raw" in
    '`'*)                                  # 백틱 경로 - 저장소 루트 기준
      link="${raw#\`}"; link="${link%\`}"
      target="$link"
      ;;
    *)                                     # 마크다운 링크 - 그 문서가 있는 디렉터리 기준
      # 형태별 접두를 한 번에 벗김 - 참조형 정의에 공백이 여러 개여도 흡수됨
      link="$(printf '%s' "$raw" | sed -E 's/^\]\(<?//; s/^\]:[[:space:]]+//; s/^src="//')"
      case "$link" in http*|//*|mailto:*) continue ;; esac
      case "$link" in /*) target=".$link" ;; *) target="$(dirname "$src")/$link" ;; esac
      ;;
  esac

  # 와일드카드 · 자리표시자는 실경로가 아님
  case "$link" in *'*'*|*'{'*|*'}'*) continue ;; esac

  # 예외 - 저장소에 없는 것이 정상인 참조. 사유는 .linkignore 주석에 적음
  if [ -f .linkignore ] && grep -qxF -- "$link" .linkignore; then
    # 추적 여부로 판정함 - 작업 트리 존재로 보면 로컬 `.env` 를 둔 개발자마다
    # 빨간불이 되고, 정작 "커밋됐는가"는 못 봄
    if git ls-files --error-unmatch "$target" >/dev/null 2>&1; then
      echo "STALE: $link 이 저장소에 추적되고 있으므로 .linkignore 예외를 지울 것"
      fail=1
    fi
    continue
  fi

  checked=$((checked + 1))
  [ -e "$target" ] || { echo "MISSING: $link (in $src)"; fail=1; }
done <<< "$links"

# --- 위키링크 잔존 검사 --------------------------------------------------
# 여는 [[ 뒤 공백을 배제함 - bash 의 [[ -n $x ]] 스니펫이 위키링크로 오탐되던 것을 막음(가이드 v3.6)
wiki="$(find $paths -name '*.md' 2>/dev/null | sort | while IFS= read -r f; do
  awk -v f="$f" '
    /^[[:space:]]*```/ { fence = !fence; next }
    !fence && /\[\[[^] 	][^]]*\]\]/ { print f ":" NR ":" $0 }
  ' "$f"
done)"
if [ -n "$wiki" ]; then
  echo "$wiki"; echo "WIKILINK 잔존 - 볼트 문법이 저장소에 섞임"; fail=1
fi

echo "참조 수집 $collected건 · 실재 검사 $checked건"
[ "$fail" -eq 0 ] && echo "문서 참조 검사 통과"
exit $fail
