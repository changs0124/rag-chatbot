import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChat } from '../hooks/useChat'
import Sidebar from '../components/chat/Sidebar'
import MessageList from '../components/chat/MessageList'
import Composer from '../components/chat/Composer'
import { IconEdit, IconMenu } from '../components/icons'

export default function ChatPage() {
  const { user, logout } = useAuth()
  const chat = useChat()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
    <div className="flex h-full bg-white dark:bg-zinc-950">
      <div className="hidden md:block">{sidebar}</div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <button
              className="text-zinc-500 hover:text-zinc-900 md:hidden dark:hover:text-zinc-100"
              onClick={() => setSidebarOpen(true)}
              aria-label="대화 목록 열기"
            >
              <IconMenu />
            </button>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">RAG 챗봇</span>
          </div>
          <button
            className="text-zinc-500 hover:text-zinc-900 md:hidden dark:hover:text-zinc-100"
            onClick={() => {
              chat.newConversation()
              setSidebarOpen(false)
            }}
            aria-label="새 채팅"
          >
            <IconEdit />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <MessageList messages={chat.messages} />
        </div>

        {chat.error && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-center text-xs text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {chat.error}
          </div>
        )}

        <Composer onSend={chat.send} streaming={chat.streaming} onStop={chat.stop} />
      </div>
    </div>
  )
}
