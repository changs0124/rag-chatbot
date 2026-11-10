/**
 * 주요 강조(accent) 버튼 클래스. 화면마다 들고 있으면 비활성 투명도와 높이가 갈린다(#330) -
 * `TextInput` 과 같은 이유로 한 곳에 둔다.
 *
 * 모양은 design-system 「5. 컴포넌트 규칙」 버튼 체계(#646) : 반경 rounded-lg, hover 는 면 색(accent-hover)만 바꾼다(크기를 키우지 않음).
 * h-11 = 44px 터치 하한(design-system 「5. 컴포넌트 규칙」 · 「7-1. 모바일」). 비활성은 `opacity-50` 하나 - 로그인 버튼과 같은 값이다.
 * 호출부는 바깥 여백(`mt-*`)만 덧붙인다. 모양을 덧칠하기 시작하면 갈리는 문제가 그대로 돌아온다.
 */
export const primaryButtonClass =
  'inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50'
