import { useState } from 'react'
import { Link } from 'react-router'
import type { Conversation } from '../../lib/types'
import { IconClose, IconPlus } from '../icons'
import ConfirmModal from '../ConfirmModal'

/**
 * 대화 목록을 시간 묶음으로 나눔(ChatGPT · Claude 공통). 제목만 길게 늘어놓으면
 * "어제 그 대화"를 눈으로 찾지 못한다. 기준은 마지막 갱신 시각이다.
 */
function groupByRecency(conversations: Conversation[]) {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const groups: { label: string; items: Conversation[] }[] = [
    { label: '오늘', items: [] },
    { label: '지난 7일', items: [] },
    { label: '이전', items: [] },
  ]
  for (const c of conversations) {
    const age = now - new Date(c.updatedAt || c.createdAt).getTime()
    const bucket = age < day ? 0 : age < 7 * day ? 1 : 2
    groups[bucket].items.push(c)
  }
  return groups.filter((g) => g.items.length > 0)
}

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
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)
  const initial = userName.trim().charAt(0) || '?'
  const groups = groupByRecency(conversations)

  return (
    <aside className="flex h-full w-full flex-col bg-surface">
      <div className="p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-xl bg-raised px-3 py-2.5 text-sm font-medium text-ink shadow-[var(--shadow-ambient)] transition duration-150 ease-[var(--ease-out-quint)] hover:scale-[1.01] active:scale-[0.99]"
        >
          <IconPlus className="h-4 w-4 text-accent" />새 대화
        </button>
      </div>

      <nav className="min-w-0 flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="px-3 pb-1 text-[11px] font-medium tracking-[0.08em] text-ink-muted">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((c) => (
                <div
                  key={c.id}
                  className={
                    'group flex items-center rounded-lg pr-1.5 text-sm transition-colors duration-150 ease-[var(--ease-out-quint)] ' +
                    (c.id === activeId
                      ? 'bg-accent-soft text-accent'
                      : 'text-ink-muted hover:bg-raised hover:text-ink')
                  }
                >
                  <button onClick={() => onSelect(c.id)} className="min-w-0 flex-1 truncate px-3 py-2 text-left">
                    {c.title}
                  </button>
                  <button
                    onClick={() => setPendingDelete(c)}
                    aria-label="대화 삭제"
                    className="shrink-0 rounded-md p-1 text-ink-muted opacity-100 transition duration-150 ease-[var(--ease-out-quint)] hover:text-danger md:opacity-0 md:group-hover:opacity-100"
                  >
                    <IconClose className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {conversations.length === 0 && (
          <p className="px-3 py-2 text-xs text-ink-muted">대화가 없습니다</p>
        )}
      </nav>

      {/* 사용자 프로필 - 클릭 시 환경설정/로그아웃 */}
      <div className="relative p-2">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-raised"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-ink">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{userName}</span>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-2 bottom-14 left-2 z-20 overflow-hidden rounded-xl bg-raised py-1 shadow-[var(--shadow-lifted)]">
              <Link
                to="/me"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2.5 text-sm text-ink transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface"
              >
                환경설정
              </Link>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onLogout()
                }}
                className="block w-full px-3 py-2.5 text-left text-sm text-ink transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface"
              >
                로그아웃
              </button>
            </div>
          </>
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="대화를 삭제할까요?"
          message={`'${pendingDelete.title}' 대화가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          onConfirm={() => {
            onDelete(pendingDelete.id)
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </aside>
  )
}
