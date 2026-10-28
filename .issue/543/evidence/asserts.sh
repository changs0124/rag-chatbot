#!/usr/bin/env bash
# 테스트 파일별 단언 호출 수 · 테스트 케이스 선언 수. 사용 : bash asserts.sh (워크트리 루트에서)
echo "# backend : 파일<TAB>@Test<TAB>단언(assertThat|assertThatThrownBy|assertEquals|assertTrue|assertFalse|verify\()"
for f in $(git ls-files 'backend/src/test/**/*.java' | sort); do
  t=$(grep -c '@Test\b' "$f"); a=$(grep -oE '\b(assertThat|assertThatThrownBy|assertThatCode|assertEquals|assertTrue|assertFalse|assertNull|assertNotNull|verify)\(' "$f" | wc -l)
  [ "$t$a" != "00" ] && printf '%s\t%s\t%s\n' "$f" "$t" "$a"
done
echo "# frontend : 파일<TAB>it/test<TAB>expect("
for f in $(git ls-files 'frontend/src/**/*.test.ts' 'frontend/src/**/*.test.tsx' | sort); do
  t=$(grep -cE '^\s*(it|test)(\.each\([^)]*\))?\(' "$f"); a=$(grep -o 'expect(' "$f" | wc -l)
  printf '%s\t%s\t%s\n' "$f" "$t" "$a"
done
