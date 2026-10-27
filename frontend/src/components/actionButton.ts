/**
 * 관리 화면 행 끝의 작은 동작 버튼(동기화 · 삭제 · 초기화) 클래스. 문서 관리와 사용자 관리가 화면을 나누면서(#513)
 * 두 곳이 들고 있게 되었다 - 갈리지 않게 `primaryButton` 과 같은 이유로 한 곳에 둔다.
 *
 * 모바일만 44px 로 키운다(design-system 「7. 모바일」). hover 글자색만 호출부가 덧붙인다.
 */
export const actionButtonClass =
  'min-h-11 shrink-0 rounded-full px-3 py-1.5 text-xs text-ink-muted transition duration-150 ease-[var(--ease-out-quint)] hover:bg-raised disabled:opacity-60 md:min-h-0'
