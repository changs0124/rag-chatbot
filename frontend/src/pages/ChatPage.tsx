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

  // 모바일에서 헤더가 밀려 올라가지 않게 함(#221). 실기기 브라우저 고유 동작 둘을 막는다 -
  // ① iOS 는 문서가 스크롤되지 않아도 가장자리에서 페이지 전체를 고무줄처럼 튕긴다 → 채팅 화면이 떠 있는
  //   동안만 문서 스크롤과 튕김을 끈다(관리·마이 페이지는 문서 스크롤을 그대로 쓴다).
  // ② 키보드가 열리면 100dvh 는 그대로이고 보이는 영역(visualViewport)만 줄며 입력 쪽으로 이동한다 →
  //   루트 높이를 보이는 영역에 맞추고 끌려 올라간 문서를 되돌린다. Android Chrome 은 index.html 의
  //   interactive-widget=resizes-content 로 레이아웃 자체가 줄어 같은 결과가 된다.
  // 헤드리스 브라우저는 가상 키보드와 튕김을 재현하지 못해 실기기로만 확인된다
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  useEffect(() => {
    const html = document.documentElement
    const prev = { overflow: html.style.overflow, overscroll: html.style.overscrollBehavior }
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'

    const vv = window.visualViewport
    const sync = () => {
      // 사용자가 손가락으로 확대한 동안은 손대지 않는다 - 확대된 보이는 영역 높이를 루트에 넣으면 화면이
      // 짧아지고, 문서를 되돌리면 확대해서 보던 자리를 잃는다(#221). 입력 포커스 확대는 글자 16px 로 막았다
      if (!vv || Math.abs(vv.scale - 1) > 0.01) return
      setViewportHeight(vv.height)
      window.scrollTo(0, 0)
    }
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    return () => {
      html.style.overflow = prev.overflow
      html.style.overscrollBehavior = prev.overscroll
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
    }
  }, [])

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
    // h-screen 이 아니라 100dvh - iOS 주소창이 접힐 때 입력창이 화면 밖으로 밀리는 것을 막음.
    // 키보드가 열려 보이는 영역이 바뀐 뒤에는 그 높이를 따른다(#221)
    <div
      className="flex h-[100dvh] bg-canvas"
      style={viewportHeight === null ? undefined : { height: viewportHeight }}
    >
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
                  className="w-full max-w-xs rounded-lg border border-line bg-raised px-2.5 py-1.5 text-base font-semibold md:text-[15px] text-ink outline-none focus:border-accent focus:shadow-[0_0_0_4px_var(--c-focus-ring)]"
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
