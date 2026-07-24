import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Conversation } from '../../lib/types'
import { IconClose } from '../icons'

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  userName,
  onLogout,
}: {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  userName: string
  onLogout: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const initial = userName.trim().charAt(0) || '?'

  return (
    <aside className="flex h-full w-64 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          + 새 대화
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={
              'group flex items-center justify-between rounded-lg px-3 py-2 text-sm ' +
              (c.id === activeId
                ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')
            }
          >
            <button onClick={() => onSelect(c.id)} className="flex-1 truncate text-left">
              {c.title}
            </button>
            <button
              onClick={() => onDelete(c.id)}
              aria-label="대화 삭제"
              className="ml-2 shrink-0 text-zinc-400 opacity-100 transition hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
        ))}
        {conversations.length === 0 && <p className="px-3 py-2 text-xs text-zinc-400">대화가 없습니다</p>}
      </nav>

      {/* 사용자 프로필 - 클릭 시 환경설정/로그아웃 */}
      <div className="relative border-t border-zinc-200 p-2 dark:border-zinc-800">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-700 text-sm font-semibold text-white dark:bg-zinc-600">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-200">{userName}</span>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-14 left-2 right-2 z-20 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
              <Link
                to="/me"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                환경설정
              </Link>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onLogout()
                }}
                className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                로그아웃
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
