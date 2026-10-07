#!/usr/bin/env bash
# 병합 충돌 표시 잔존 검사 (#210)
#
# 왜 필요한가 : `docs/02_architecture/overview.md` 에 `<<<<<<<` · `=======` · `>>>>>>>` 가 **약 3주 동안
# main 에 커밋된 채** 있었다(#207 로 제거). 그동안 다른 게이트는 매번 통과했다 - 참조 실재 · 섹션 이름 ·
# 셸 구문 어느 것도 충돌 표시를 보지 않는다. 발견은 issue-merge 의 비판 단계가 우연히 했다.
#
# 무엇을 잡나 : 줄 맨 앞의 `<<<<<<< ` · `>>>>>>> ` · `||||||| `(diff3) — git 이 남기는 모양 그대로다.
# **추적 중인 파일 전체 + 추적 전 새 파일**을 본다(`.gitignore` 는 따른다). 문서만이 아니라
# 스크립트 · 소스에 남아도 똑같이 깨지기 때문이다. 바이너리는 건너뛴다(`-I`).
#
# 무엇을 일부러 안 잡나 : 단독 `=======` 줄. 마크다운 setext 제목의 밑줄과 모양이 같아 오탐이 난다.
# 충돌이면 위아래 표시가 반드시 같이 있으므로 그 둘만 보면 놓치지 않는다.
# 줄 중간에 적은 표시(이 주석 · 백틱 안 예시)도 잡지 않는다 - 줄 맨 앞만 본다.
#
# grep 기반이다 - CI `static` 잡은 checkout 과 bash 뿐이라 node·JDK 가 없다(check-doc-refs.sh 와 같은 제약).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# 검사 대상을 실제로 모았는지 먼저 단언한다 - 빈 목록을 돌며 조용히 통과하는 형태를 막는다
total="$(git ls-files --cached --others --exclude-standard | wc -l | tr -d ' ')"
[ "$total" -gt 0 ] || { echo "검사 대상 파일이 하나도 없음 - 저장소 위치부터 의심할 것"; exit 1; }

hits="$(git grep --untracked -I -nE '^(<<<<<<<|>>>>>>>|\|\|\|\|\|\|\|) ' || true)"

if [ -n "$hits" ]; then
	echo "병합 충돌 표시가 남아 있다 - 양쪽 의도를 보고 해소한 뒤 표시 줄을 지울 것 :"
	printf '%s\n' "$hits" | sed 's/^/  /'
	exit 1
fi
echo "충돌 표시 검사 통과 (파일 ${total}개)"
