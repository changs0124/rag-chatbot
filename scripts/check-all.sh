#!/usr/bin/env bash
# 품질 게이트를 **푸시 전에 로컬에서 미리** 돌린다(#127). CI 가 돌리는 것과 같은 스크립트다.
#
# **CI 를 대체하지 않는다.** 최종 관문은 여전히 GitHub Actions 이고, 이건 거기서 빨간불을 보기
# 전에 먼저 잡으려는 것이다. **실패할 걸 알면서 밀지 않는 것**이 왕복 시간을 아낀다 -
# 공개 전환(2026-09-11)으로 Actions 분은 무료가 됐지만, 밀고 기다렸다 빨간불을 보는 시간은
# 그대로다.
#
# 하나 더 : `secrets` · `deps` 잡은 **CI 에서도 변경마다 돈다**(#135). 여기서 미리 돌려 두면
# 푸시 전에 같은 답을 볼 수 있다(gitleaks · trivy 가 설치되어 있을 때).
#
# 사용법 :
#   bash scripts/check-all.sh          # 전부
#   bash scripts/check-all.sh docs     # 문서 검사만 (JDK·Node 불필요)
#   bash scripts/check-all.sh quick    # 무거운 빌드 빼고 (docs + contract + 런타임 버전)
#
# 종료 코드는 **실패한 검사 수**다. 0 이면 전부 통과.
# **`-e` 를 켠다(#129).** 없으면 저장소 밖에서 실행할 때 `git rev-parse` 가 실패해 `cd ""` 가 되고,
# 그대로 **현재 디렉터리 기준으로** 검사가 돈다 - `rm -f vitest-report.json` 과 `cd frontend` 가
# 엉뚱한 곳을 건드린다. 검사 실패는 `run()` 이 잡아 삼키므로 -e 가 흐름을 끊지 않는다.
#
# `pipefail` 은 이 셸의 파이프라인에만 걸린다. **`bash -c '... | ...'` 자식은 상속하지 않으므로**,
# 앞으로 파이프를 쓰는 검사를 추가하면 그 안에서 `set -o pipefail` 을 직접 켜야 한다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

MODE="${1:-all}"
fail=0
declare -a FAILED=()
declare -a SKIPPED=()

# **건너뛴 검사를 따로 센다(#129).** 종전에는 노란 줄만 찍고 요약은 `fail` 만 봐서,
# docker/gitleaks/trivy 가 셋 다 없어도 **"전부 통과" + exit 0** 이 나왔다.
# 한 건도 돌리지 않고 초록불이 뜬다 - 이 스크립트가 스스로 경고하던 바로 그 혼동이다.
skip() {
	# **`%s` 둘을 반드시 남긴다(#138).** 종전 포맷 문자열에는 변환 지정자가 없어
	# 인자 둘이 조용히 버려지고 리터럴만 찍혔다 - 이 함수가 존재하는 이유인 "건너뛴 사실을
	# 크게 남긴다"가 정작 동작하지 않았다. `bash -n` 은 구문 오류가 아니라 통과한다(#136).
	# 형태는 `run()` 과 맞춘다 - 호출부에서 `run` 자리에 그대로 들어가기 때문이다.
	printf '\n\033[1m▶ %s\033[0m\n' "$1"
	printf '\033[33m  - 건너뜀: %s\033[0m\n' "$2"
	SKIPPED+=("$1 - $2")
}

run() {
	local name="$1"; shift
	printf '\n\033[1m▶ %s\033[0m\n' "$name"
	if "$@"; then
		printf '\033[32m  ✓ %s\033[0m\n' "$name"
	else
		printf '\033[31m  ✗ %s\033[0m\n' "$name"
		fail=$((fail + 1))
		FAILED+=("$name")
	fi
}

# 요약 출력 - 조기 종료(docs/quick)와 전체 실행이 **같은 형식**을 쓰도록 함수로 뺐다(#129).
# 종전에는 조기 종료가 "실패 N건" 만 찍어 건너뜀이 보고되지 않았다.
summary() {
	printf '\n────────────────────────────\n'
	if [ "$fail" -eq 0 ]; then
		if [ "${#SKIPPED[@]}" -eq 0 ]; then
			printf '\033[32m전부 통과\033[0m\n'
		else
			# **"전부 통과"라고 쓰지 않는다.** 돌린 것만 통과했을 뿐이다
			printf '\033[32m돌린 검사는 전부 통과\033[0m\n'
		fi
	else
		printf '\033[31m실패 %d건:\033[0m\n' "$fail"
		for f in "${FAILED[@]}"; do printf '  - %s\n' "$f"; done
	fi

	if [ "${#SKIPPED[@]}" -ne 0 ]; then
		printf '\033[33m\n건너뜀 %d건 - 이 검사들은 돌지 않았다:\033[0m\n' "${#SKIPPED[@]}"
		for k in "${SKIPPED[@]}"; do printf '\033[33m  - %s\033[0m\n' "$k"; done
		printf '\033[33m도구를 설치하고 다시 돌리기 전까지 이 항목은 "통과"가 아니라 "모름"이다.\033[0m\n'
	fi

	# 종료 코드는 **실패한 검사 수**다. 건너뜀은 코드에 반영하지 않는다 - gitleaks/trivy 가
	# Windows 개발기에 기본으로 없어, 건너뜀을 실패로 만들면 매번 빨간불이라 곧 무시하게 된다.
	# 대신 위 요약에서 "통과"와 "모름"을 말로 구분한다.
	exit "$fail"
}

# --- 문서·셸 계열 : JDK·Node 없이 돈다 (CI 의 static 잡) ---------------------
# **셸 구문을 제일 먼저 본다(#136).** 아래 검사들이 전부 셸 스크립트라, 그중 하나에 구문
# 오류가 있으면 그 검사만 죽고 나머지는 통과해 **부분적인 초록불**이 나온다. 앞에 두면
# "검사가 깨졌다"와 "검사가 잡아냈다"가 구분된다. 이 스크립트 자신도 검사 대상이다
run "셸 구문 검사"          bash scripts/check-shell-syntax.sh
run "문서 참조 실재"        bash scripts/check-doc-refs.sh
run "문서 섹션 이름 대조"    bash scripts/check-doc-sections.sh

if [ "$MODE" = "docs" ]; then
	summary
	exit "$fail"
fi

# --- 계약·버전 : 가벼움 (계약은 CI 의 static 잡, 런타임 버전은 각 코드 잡) ----
run "응답 계약 대조"         bash scripts/check-response-contract.sh
run "런타임 버전 대조(java)" bash scripts/check-runtime-versions.sh java
run "런타임 버전 대조(node)" bash scripts/check-runtime-versions.sh node

if [ "$MODE" = "quick" ]; then
	summary
	exit "$fail"
fi

# --- 백엔드 (CI 의 backend 잡) -------------------------------------------------
# `check-doc-versions.sh` 는 .m2 가 채워진 뒤에만 실제 값을 읽으므로 verify 뒤에 둔다.
#
# **`clean` 을 붙인다.** 원격 CI 는 매번 빈 러너라 필요 없었지만, 로컬은 `target/` 이 남아
# **지운 테스트 클래스의 surefire XML 이 계속 계수된다.** 2026-07-28 에 실제로 이 때문에 로컬
# 실측이 6건 부풀려져 하한을 잘못 올렸고 원격 CI 가 잡아냈다 — 이제 그 원격이 없으므로
# 여기서 막아야 한다(`check-case-floor.sh` 머리주석 참고)
run "백엔드 clean verify"    bash -c 'cd backend && ./mvnw -B clean verify'
run "백엔드 케이스 수 하한"   bash scripts/check-case-floor.sh backend
run "문서 버전 주장 대조"     bash scripts/check-doc-versions.sh

# --- 프론트 (CI 의 frontend 잡) ------------------------------------------------
# **의존성부터 깐다.** 종전 CI 는 매번 빈 러너에서 시작해 `npm ci` 가 첫 단계였다. 로컬로 옮기면서
# 이걸 빠뜨리면 새 워크트리(node_modules 가 없다)에서 lint·test·build 가 전부 "명령 없음"으로
# 죽는다 — 실제로 그렇게 4건이 한꺼번에 실패했다. `npm ci` 는 lock 파일과 정확히 일치시키므로
# 이미 깔려 있어도 안전하고, 로컬과 배포의 의존성이 갈리는 것도 함께 막는다
run "프론트 의존성 설치"      bash -c 'cd frontend && npm ci'
run "프론트 lint"            bash -c 'cd frontend && npm run lint'
# **낡은 리포트를 먼저 지우고 json 리포터로 돈다.** `check-case-floor.sh` 는 리포트를 읽기만 하고
# 만들지 않아서, 그냥 `npm test` 를 돌리면 **이전 실행의 케이스 수가 그대로 남는다** - 테스트를
# 지워도 낡은(더 큰) 수로 게이트가 통과해, 이 게이트가 막으려던 상황을 그대로 놓친다.
# 원격 CI 는 클린 체크아웃이라 겪지 않던 구멍이고, 로컬로 옮긴 지금은 여기가 유일한 방어선이다
run "프론트 test"            bash -c 'cd frontend && rm -f vitest-report.json && npm test -- --reporter=json --outputFile=vitest-report.json'
run "프론트 build"           bash -c 'cd frontend && npm run build'
run "프론트 케이스 수 하한"   bash scripts/check-case-floor.sh frontend

# --- 이미지 (CI 의 docker 잡) --------------------------------------------------
# 배포 산출물이 조용히 썩는 것을 막는다 - pom·소스 구조가 바뀌어 Dockerfile 이 깨지면
# 정작 배포하는 날이 아니라 여기서 먼저 드러난다. 종전 CI 의 의도를 그대로 가져왔다
if command -v docker >/dev/null 2>&1; then
	# **`deploy.sh` 와 같은 태그로 빌드한다(#129).** 종전에는 여기가 `:check`, deploy 가 `:latest`
	# 라 **같은 Dockerfile 을 320MB 씩 두 번** 빌드했고, `:latest` 가 로컬에 아예 없어
	# `deploy.sh --skip-build` 가 즉시 실패했다. 태그를 맞추면 **게이트를 통과한 바로 그 이미지가
	# 배포된다** - `check-all.sh` 뒤에 `deploy.sh --skip-build` 를 부르면 재빌드 없이 그대로 나간다
	run "백엔드 이미지 빌드"  docker build -t rag-chatbot-backend:latest backend
else
	skip "백엔드 이미지 빌드" "docker 없음"
fi

# --- 시크릿 스캔 (CI 의 secrets 잡 · 변경마다) --------------------------------------------
# 도구가 없으면 **건너뛴 사실을 크게 남긴다.** 조용히 넘어가면 "통과"와 "검사 안 함"이
# 구분되지 않는다 - 종전 CI 가 trivy 에 list-all-pkgs 를 켠 것과 같은 이유다.
# 설치 : https://github.com/gitleaks/gitleaks/releases (CI 가 쓰던 버전은 8.30.1)
if command -v gitleaks >/dev/null 2>&1; then
	run "시크릿 스캔(전체 이력)" gitleaks git . --no-banner --redact
else
	skip "시크릿 스캔" "gitleaks 없음 - 커밋 전 최소 한 번은 돌릴 것"
fi

# --- 의존성 취약점 (CI 의 deps 잡 · 변경마다) ---------------------------------------------
run "프론트 의존성 audit"    bash -c 'cd frontend && npm audit --audit-level=high'
if command -v trivy >/dev/null 2>&1; then
	# `--list-all-pkgs` 는 종전 CI 가 켜 두던 것이다 - 해석한 패키지를 출력에 남겨야
	# 「취약점 0건」과 「패키지를 한 건도 해석하지 못함」이 구분된다
	run "백엔드 의존성 스캔"  trivy fs --scanners vuln --severity HIGH,CRITICAL --exit-code 1 --list-all-pkgs backend
else
	skip "백엔드 의존성 스캔" "trivy 없음"
fi

# --- 요약 --------------------------------------------------------------------

summary
