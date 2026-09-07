#!/usr/bin/env bash
# 응답 계약 대조 - `AdminDtos.DocumentResponse` 한 건만 본다
#
# 왜 이것만인가 : 저장소에서 repository 가 Response DTO 를 직접 매핑하는 경로는
# `RagDocumentRepository.listAlive()` 뿐이다(docs/02_architecture/backend.md). 그 한 곳에서만
# **SQL 이 응답 스펙에 직결**되고, 필드 이름이 프론트까지 그대로 흘러간다.
#
# 무엇을 잡나 : 네 곳의 필드 이름이 어긋나는 것. 필드 추가 · 삭제 · 개명 · resultMap arg 순서 변경.
# 무엇을 못 잡나 : 타입 변경과 값 오결선. 그쪽은 AdminDocumentFlowTest 의 값 단언이 본다.
#
# 순서 규칙이 축마다 다르다
# - record ↔ resultMap : **순서까지** 같아야 한다. MyBatis 가 위치로 생성자를 찾는다
# - record ↔ 프론트    : 이름 집합만 본다. TS 의 필드 순서는 런타임 의미가 없다
#
# 프론트를 **두 곳** 보는 이유 : `tsconfig.app.json` 이 `src/**/*.test.tsx` 를 exclude 하고 vitest 는
# 타입 검사를 하지 않아, `AdminPage.test.tsx` 의 `doc()` 픽스처는 어느 게이트도 거치지 않는다.
# `RagDocument` 에 필수 필드를 하나 더해도 `npm run build` 와 케이스 74개가 전부 통과했다(#25 실측).
# 타입만 보면 픽스처가 따로 놀고, 픽스처만 보면 타입이 따로 논다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

java_src=backend/src/main/java/com/ragchatbot/dto/AdminDtos.java
xml_src=backend/src/main/resources/mapper/RagDocumentRepository.xml
ts_src=frontend/src/lib/types.ts
fixture_src=frontend/src/pages/AdminPage.test.tsx

for f in "$java_src" "$xml_src" "$ts_src" "$fixture_src"; do
  [ -f "$f" ] || { echo "대조 실패 : $f 없음" >&2; exit 1; }
done

# record 컴포넌트 이름 - 괄호 안을 쉼표로 끊고 각 조각의 마지막 토큰만 취함
from_record() {
  { tr -d '\r' < "$java_src" | tr '\n' ' ' \
      | grep -o 'record DocumentResponse([^)]*)' \
      | sed 's/^record DocumentResponse(//; s/)$//' \
      | tr ',' '\n' | awk 'NF{print $NF}'
  } || true
}

# summaryResult 의 <idArg>/<arg> column 을 선언 순서대로. snake_case -> camelCase
from_result_map() {
  { tr -d '\r' < "$xml_src" \
      | awk '/<resultMap id="summaryResult"/{f=1} f{print} f&&/<\/resultMap>/{exit}' \
      | grep -o 'column="[^"]*"' | sed 's/column="//; s/"$//' \
      | awk -F_ '{s=$1; for(i=2;i<=NF;i++) s=s toupper(substr($i,1,1)) substr($i,2); print s}'
  } || true
}

# RagDocument 인터페이스 본문의 필드명. `//` 주석 줄은 첫 글자가 식별자가 아니라 걸러짐
from_types() {
  { tr -d '\r' < "$ts_src" \
      | awk '/^export interface RagDocument \{/{f=1;next} f&&/^\}/{exit} f{print}' \
      | grep -oE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*\??:' \
      | sed 's/[[:space:]]//g; s/:$//; s/?$//'
  } || true
}

# doc() 픽스처가 세우는 키. `...over` 는 식별자로 시작하지 않아 걸러짐
from_fixture() {
  { tr -d '\r' < "$fixture_src" \
      | awk '/^function doc\(/{f=1;next} f&&/^\}/{exit} f{print}' \
      | grep -oE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*:' \
      | sed 's/[[:space:]]//g; s/:$//'
  } || true
}

joined() { "$1" | tr '\n' ' '; }
sorted()  { "$1" | LC_ALL=C sort | tr '\n' ' '; }

record="$(joined from_record)"
result_map="$(joined from_result_map)"
types="$(joined from_types)"
fixture="$(joined from_fixture)"

# 빈 목록을 조용히 통과시키지 않음 - 추출이 깨지면 게이트가 아무것도 안 보게 됨
for pair in "record:$record" "resultMap:$result_map" "types.ts:$types" "AdminPage.test.tsx doc():$fixture"; do
  [ -n "${pair#*:}" ] || { echo "대조 실패 : ${pair%%:*} 에서 필드를 한 개도 못 뽑음" >&2; exit 1; }
done

echo "AdminDtos.DocumentResponse   ${record% }"
echo "summaryResult <arg column>   ${result_map% }"
echo "types.ts RagDocument         ${types% }"
echo "AdminPage.test.tsx doc()     ${fixture% }"

fail=0
if [ "$record" != "$result_map" ]; then
  echo "어긋남 : record 와 resultMap 의 필드가 순서까지 같아야 한다(MyBatis 가 위치로 생성자를 찾음)" >&2
  fail=1
fi

record_sorted="$(sorted from_record)"
for pair in "types.ts:$(sorted from_types)" "AdminPage.test.tsx doc():$(sorted from_fixture)"; do
  name="${pair%%:*}"; got="${pair#*:}"
  [ "$record_sorted" = "$got" ] && continue
  echo "어긋남 : record 와 $name 쪽 필드 이름 집합이 다르다" >&2
  echo "  record : ${record_sorted% }" >&2
  echo "  $name : ${got% }" >&2
  fail=1
done

[ "$fail" -eq 0 ] || exit 1
echo "✓ 응답 계약 4곳 일치 ($(from_record | wc -l | tr -d ' ')필드)"
