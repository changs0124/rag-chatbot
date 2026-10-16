import type { ReactNode } from 'react'

interface PageShellProps {
  // 폭만 화면마다 다르다. Tailwind 가 소스에서 클래스를 찾으므로 조각이 아닌 완성된 클래스로 받는다
  maxWidth: 'max-w-2xl' | 'max-w-3xl'
  children: ReactNode
}

/**
 * 마이페이지 · 관리자의 페이지 골격. 위 여백 `pt-2` 는 `BackLink` 와 함께 「상단은 채팅 헤더와 같은 높이」를
 * 지키는 값이라 두 화면이 따로 들고 있으면 한쪽만 갈린다(#330).
 */
export default function PageShell({ maxWidth, children }: PageShellProps) {
  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-canvas">
      <div className={`mx-auto ${maxWidth} px-4 pt-2 pb-8 md:px-6 md:pt-8`}>{children}</div>
    </div>
  )
}
