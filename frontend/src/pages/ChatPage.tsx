import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChat } from '../hooks/useChat'
import Sidebar from '../components/chat/Sidebar'
import ResizableSidebar from '../components/chat/ResizableSidebar'
import MessageList from '../components/chat/MessageList'
import Composer from '../components/chat/Composer'
import { IconEdit, IconMenu } from '../components/icons'

export default function ChatPage() {
  const { user, logout } = useAuth()
  const chat = useChat()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const activeTitle = chat.conversations.find((c) => c.id === chat.activeId)?.title

  // 드로어가 열린 동안 뒤 화면이 같이 스크롤되면 어디를 보고 있었는지 잃는다
  useEffect(() => {
    if (!sidebarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [sidebarOpen])

  function commitTitle() {
    setEditingTitle(false)
    const next = titleDraft.trim()
    if (chat.activeId && next && next !== activeTitle) {
      chat.renameConversation(chat.activeId, next)
    }
  }

  const sidebar = (
    <Sidebar
      conversations={chat.conversations}
      activeId={chat.activeId}
      onSelect={(id) => {
        chat.selectConversation(id)
        setSidebarOpen(false)
      }}
      onNew={() => {
        chat.newConversation()
        setSidebarOpen(false)
      }}
      onDelete={chat.deleteConversation}
      userName={user?.name ?? ''}
      onLogout={logout}
    />
  )

  return (
    // h-screen 이 아니라 100dvh - iOS 주소창이 접힐 때 입력창이 화면 밖으로 밀리는 것을 막음
    <div className="flex h-[100dvh] bg-canvas">
      <div className="hidden md:block">
        <ResizableSidebar>{sidebar}</ResizableSidebar>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(84vw,320px)] shadow-[var(--shadow-lifted)]">
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center gap-1 px-3 py-2">
          <button
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-muted transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface hover:text-ink md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="대화 목록 열기"
          >
            <IconMenu />
          </button>

          {/* 활성 대화 제목 - 클릭하면 인라인 수정(GPT/Claude 방식) */}
          <div className="min-w-0 flex-1">
            {chat.activeId ? (
              editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitTitle()
                    } else if (e.key === 'Escape') {
                      setEditingTitle(false)
                    }
                  }}
                  className="w-full max-w-xs rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[15px] font-semibold text-ink outline-none focus:border-accent"
                />
              ) : (
                <button
                  onClick={() => {
                    setTitleDraft(activeTitle ?? '')
                    setEditingTitle(true)
                  }}
                  title="제목 변경"
                  className="max-w-full truncate rounded-lg px-2.5 py-1.5 text-[15px] font-semibold text-ink transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface"
                >
                  {activeTitle ?? '새 대화'}
                </button>
              )
            ) : (
              <span className="px-2.5 text-[15px] font-semibold text-ink-muted">새 대화</span>
            )}
          </div>

          <button
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-muted transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface hover:text-ink md:hidden"
            onClick={() => {
              chat.newConversation()
              setSidebarOpen(false)
            }}
            aria-label="새 채팅"
          >
            <IconEdit />
          </button>
        </header>

        {/* 스크롤 페이드 - 입력창 뒤로 글이 잘리지 않고 사라지게 함 */}
        <div className="relative min-h-0 flex-1">
          <div className="h-full overflow-y-auto">
            <MessageList messages={chat.messages} stage={chat.stage} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-canvas to-transparent" />
        </div>

        {chat.error && (
          <div className="px-4 pb-1 text-center text-[13px] text-danger">{chat.error}</div>
        )}

        <Composer onSend={chat.send} streaming={chat.streaming} onStop={chat.stop} />
      </div>
    </div>
  )
}
