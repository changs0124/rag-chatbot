import { useAuth } from '../auth/AuthContext'

// Phase 6b에서 Sidebar/MessageList/Composer/CameraCapture로 채워짐
export default function ChatPage() {
  const { user, logout } = useAuth()
  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">RAG 챗봇</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">{user?.name}</span>
          <button onClick={logout} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            로그아웃
          </button>
        </div>
      </header>
      <main className="grid flex-1 place-items-center text-sm text-zinc-400">채팅 화면은 다음 단계(6b)에서 구현됩니다.</main>
    </div>
  )
}
