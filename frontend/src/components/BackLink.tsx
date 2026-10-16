import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { IconChevronLeft } from './icons'

interface BackLinkProps {
  to: string
  children: ReactNode
}

/**
 * 마이페이지 · 관리자 상단의 뒤로가기. 두 화면이 각자 들고 있으면 한쪽만 갈려 한 곳에 둔다(#330).
 * 모바일 h-11(44px) + 바깥 `pt-2` 가 채팅 헤더 `min-h-14` 의 버튼 줄과 높이를 맞춘다(design-system 「7. 모바일」).
 * `-ml-2 px-2` 는 누르는 영역만 넓히고 글자 위치는 그대로 둔다.
 */
export default function BackLink({ to, children }: BackLinkProps) {
  return (
    <Link
      to={to}
      className="-ml-2 inline-flex h-11 items-center gap-1 rounded-xl px-2 text-sm text-ink-muted transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-ink md:ml-0 md:h-auto md:rounded-none md:px-0"
    >
      <IconChevronLeft className="h-4 w-4" />
      {children}
    </Link>
  )
}
