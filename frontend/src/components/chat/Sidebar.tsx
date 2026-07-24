import type { Conversation } from '../../lib/types'

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
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
              className="ml-2 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
            >
              ×
            </button>
          </div>
        ))}
        {conversations.length === 0 && <p className="px-3 py-2 text-xs text-zinc-400">대화가 없습니다</p>}
      </nav>
    </aside>
  )
}
