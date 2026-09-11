#!/usr/bin/env bash
# 케이스 수 하한 게이트 - 테스트 명령은 케이스가 삭제돼도 통과하므로 수를 따로 잼(가이드 4단계)
# 사용 : check-case-floor.sh backend | frontend
#
# 주의(로컬) : **반드시 clean 후 측정할 것**. surefire 리포트는 지운 테스트 클래스의 XML이
# target/ 에 그대로 남아, 개명·삭제한 클래스가 계속 계수됨. 2026-07-28에 실제로 이 때문에
# 로컬 실측이 6건 부풀려져 하한을 잘못 올렸고 원격 CI(클린 체크아웃)가 잡아냄
#
# 프론트도 같음, 그리고 더 위험함 : 이 스크립트는 frontend/vitest-report.json 을 읽기만 하고
# 직접 만들지 않음. 그냥 `vitest run` 을 돌리면 리포트가 갱신되지 않아 **이전 실행의 수가 그대로
# 남음**. 테스트를 지운 뒤 리포트를 다시 만들지 않으면 낡은(더 큰) 수로 게이트가 통과해,
# 이 게이트가 막으려던 바로 그 상황을 놓침. 측정 전에 반드시 :
#   cd frontend && npx vitest run --reporter=json --outputFile=vitest-report.json
# 원격 CI는 클린 체크아웃이라 매번 새로 만들므로 이 구멍은 로컬 한정임
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# shellcheck source=scripts/case-floors.env
. scripts/case-floors.env

target="${1:-}"
case "$target" in
  backend|frontend) ;;
  *) echo "사용법 : $0 backend|frontend"; exit 1 ;;
esac

# 백엔드 - surefire XML의 testsuite 속성을 합산하고 skip은 뺌
count_backend() {
  local dir=backend/target/surefire-reports
  [ -d "$dir" ] || { echo "수집 실패 : $dir 없음 - test를 먼저 돌릴 것" >&2; exit 1; }

  local suites
  # 속성이 줄바꿈으로 접히는 경우가 있어 개행을 지우고 태그 단위로 뽑음
  suites="$(cat "$dir"/TEST-*.xml 2>/dev/null | tr '\n' ' ' | grep -o '<testsuite [^>]*>' || true)"
  # 대상을 실제로 수집했는지 먼저 단언함 - 빈 목록을 돌며 조용히 통과하는 형태를 막음(가이드 6단계 경고)
  [ -n "$suites" ] || { echo "수집 실패 : surefire XML에서 testsuite를 한 건도 못 찾음" >&2; exit 1; }

  printf '%s\n' "$suites" | awk '
    {
      t = 0; k = 0
      if (match($0, /tests="[0-9]+"/))   { t = substr($0, RSTART + 7, RLENGTH - 8) }
      if (match($0, /skipped="[0-9]+"/)) { k = substr($0, RSTART + 9, RLENGTH - 10) }
      total += t - k
    }
    END { print total + 0 }
  '
}

# 프론트 - vitest JSON 리포트에서 전체 - 보류(skip/todo)
count_frontend() {
  local report=frontend/vitest-report.json
  [ -f "$report" ] || { echo "수집 실패 : $report 없음 - npm test -- --reporter=json --outputFile=vitest-report.json 를 먼저 돌릴 것" >&2; exit 1; }

  node -e '
    const fs = require("fs");
    const r = JSON.parse(fs.readFileSync("frontend/vitest-report.json", "utf8"));
    const total = r.numTotalTests, pending = r.numPendingTests ?? 0, todo = r.numTodoTests ?? 0;
    if (typeof total !== "number") { console.error("수집 실패 : numTotalTests가 없음"); process.exit(1); }
    if (total === 0) { console.error("수집 실패 : 케이스 0건 - 패턴이 대상을 못 잡은 것으로 봄"); process.exit(1); }
    console.log(total - pending - todo);
  '
}

case "$target" in
  backend)  actual="$(count_backend)";  min="$BACKEND_MIN" ;;
  frontend) actual="$(count_frontend)"; min="$FRONTEND_MIN" ;;
esac

echo "케이스 수($target) : 실측 $actual / 하한 $min"
if [ "$actual" -lt "$min" ]; then
  echo "FAIL: 케이스 수가 하한 아래임 - 테스트가 지워졌는지, 검사 대상이 줄었는지 먼저 볼 것"
  echo "      하한을 내려야 한다면 scripts/case-floors.env 와 docs/06_changelog/CHANGELOG.md 를 같은 PR에서 고칠 것"
  exit 1
fi
echo "OK"
