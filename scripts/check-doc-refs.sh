#!/usr/bin/env bash
# 문서 참조 실재 검사 + 볼트 위키링크 잔존 검사
# - 마크다운 링크가 실재하는 파일을 가리키는지 검사(앵커 · 타이틀 · 꺾쇠 · 참조형 · <img src> 포함)
# - **백틱으로 적은 저장소 경로**(`docs/…` · `scripts/…` · `backend/…` · `frontend/…` · `.github/…`)도 검사
#   문서 상호 참조 대부분이 백틱이라 링크만 보면 사각지대다
# - 저장소에 [[위키링크]](볼트 문법)가 섞이지 않았는지 검사
# grep 기반(어디서나 실 바이너리) - rg 미설치 환경에서도 동작
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
fail=0

EXT='md|mdx|ts|tsx|js|jsx|mjs|cjs|json|ya?ml|java|kt|py|sql|sh|xml|css|html?|txt|png|jpe?g|gif|svg|webp|env|toml'

# 검사 대상 - check-doc-sections.sh · check-doc-versions.sh 와 같은 값
paths=(docs README.md)

# --- 수집 ---------------------------------------------------------------
# 1) 마크다운 링크 · 참조형 정의 · <img src>. 앵커(#) · 타이틀(" ") · 꺾쇠(< >)가 붙은 형태까지
md_links="$(grep -rHoE "(\]\(<?|\]:[[:space:]]+|src=\")[^)\"#<>[:space:]]+\.($EXT)" "${paths[@]}" || true)"
# 2) 백틱으로 적은 저장소 경로 - 최상위 디렉터리로 시작하는 것만(상대 경로 오탐 방지)
# 백틱을 **리터럴로** 찾는 정규식이다. 단일 따옴표가 의도이므로 확장되면 안 된다
# shellcheck disable=SC2016
bt_links="$(grep -rHoE '`(docs|scripts|backend|frontend|\.github)/[^`[:space:]]+`' "${paths[@]}" || true)"

links=""
[ -n "$md_links" ] && links="$md_links"
[ -n "$bt_links" ] && links="$links
$bt_links"

# 대상을 실제로 수집했는지 먼저 단언함 - 빈 목록을 돌며 조용히 통과하는 형태를 막음
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
# 여는 [[ 뒤 공백을 배제함 - bash 의 [[ -n $x ]] 스니펫이 위키링크로 오탐되던 것을 막음
wiki="$(find "${paths[@]}" -name '*.md' 2>/dev/null | sort | while IFS= read -r f; do
  awk -v f="$f" '
    /^[[:space:]]*```/ { fence = !fence; next }
    # 그림 표식 [[그림:<key>]] 은 제품 문법이라 빼고 본다(FEAT-CHAT-004). 줄째 건너뛰지 않고 표식만 지워서,
    # 같은 줄의 진짜 위키링크는 여전히 걸린다
    !fence { line = $0; gsub(/\[\[그림:[a-z0-9<>-]*\]\]/, "", line) }
    !fence && line ~ /\[\[[^] 	][^]]*\]\]/ { print f ":" NR ":" $0 }
  ' "$f"
done)"
if [ -n "$wiki" ]; then
  echo "$wiki"; echo "WIKILINK 잔존 - 볼트 문법이 저장소에 섞임"; fail=1
fi

echo "참조 수집 $collected건 · 실재 검사 $checked건"
[ "$fail" -eq 0 ] && echo "문서 참조 검사 통과"
exit $fail
