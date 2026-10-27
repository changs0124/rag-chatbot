import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChat } from '../hooks/useChat'
import Sidebar from '../components/chat/Sidebar'
import ResizableSidebar from '../components/chat/ResizableSidebar'
import MessageList from '../components/chat/MessageList'
import Composer from '../components/chat/Composer'
import ConfirmModal from '../components/ConfirmModal'
import { IconEdit, IconMenu } from '../components/icons'
import { MAX_TITLE_CHARS } from '../lib/limits'

// 헤더 양끝의 모바일 전용 아이콘 버튼(목록 열기 · 새 채팅)(#390)
const headerIconBtn =
  'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-muted transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface hover:text-ink md:hidden'

// 확인을 기다리는 이동 - 새 채팅 또는 다른 대화(#503)
type LeaveTarget = { to: 'new' } | { to: 'select'; id: string }

export default function ChatPage() {
  const { user, logout } = useAuth()
  const chat = useChat()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  // Enter · Esc 로 닫으면 세운다(#483 F5) - Chromium 은 포커스된 입력을 언마운트할 때 blur 를 내는데, 그 onBlur 는
  // 마지막 렌더의 초안을 들고 있어 Esc 가 저장으로, Enter 가 두 번째 PATCH 로 바뀐다. 편집을 열 때 내린다
  const skipBlurRef = useRef(false)

  const activeTitle = chat.conversations.find((c) => c.id === chat.activeId)?.title

  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  // 마크다운 청크를 미리 받아 둔다(#417) - 첫 답변 자리에서 평문→서식 깜빡임과, 오래 열어 둔 탭이 재배포 뒤 옛 청크를 찾는 창을 줄인다.
  // 실패는 무시한다 - 그리는 쪽(MessageList)이 평문으로 물러선다
  useEffect(() => {
    import('../components/chat/Markdown').catch(() => {})
  }, [])
  // 모바일에서 헤더가 밀려 올라가지 않게 함(#221). 실기기 브라우저 고유 동작 둘을 막는다 -
  // ① iOS 는 문서가 스크롤되지 않아도 가장자리에서 페이지 전체를 고무줄처럼 튕긴다 → 채팅 화면이 떠 있는
  //   동안만 문서 스크롤과 튕김을 끈다(관리·마이 페이지는 문서 스크롤을 그대로 쓴다).
  // ② 키보드가 열리면 100dvh 는 그대로이고 보이는 영역(visualViewport)만 줄며 입력 쪽으로 이동한다 →
  //   루트 높이를 보이는 영역에 맞추고 끌려 올라간 문서를 되돌린다. Android Chrome 은 index.html 의
  //   interactive-widget=resizes-content 로 레이아웃 자체가 줄어 같은 결과가 된다.
  // 헤드리스 브라우저는 가상 키보드와 튕김을 재현하지 못해 실기기로만 확인된다
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

  // 사이드바에 넘기는 핸들러는 참조를 고정한다(#405) - 매 렌더 새 함수면 Sidebar 의 memo 가 스트리밍 토큰마다 무너진다.
  // useChat 의 두 콜백은 토큰마다 바뀌지 않는다 - selectConversation 은 대화가 바뀔 때만 새로 만들어진다
  const { newConversation, selectConversation } = chat

  // 사이드바 버튼과 모바일 헤더 버튼이 같이 쓴다 - 모바일 드로어가 열려 있으면 닫는다
  const leave = useCallback(
    (target: LeaveTarget) => {
      if (target.to === 'new') newConversation()
      else selectConversation(target.id)
      setSidebarOpen(false)
    },
    [newConversation, selectConversation],
  )

  // 답을 받는 중에 떠나면 그 턴이 중단된다 - 먼저 묻는다(#503). 판정(settling) 중에는 묻지 않는다 -
  // 옮기면 잠금만 풀리고 판정은 뒤에서 이어 간다(#489 리뷰). 이 값은 턴마다 두 번만 바뀌어 #405 의 memo 를 무너뜨리지 않는다
  const guardLeave = chat.streaming && !chat.settling
  const [pendingLeave, setPendingLeave] = useState<LeaveTarget | null>(null)
  // 묻는 사이 답이 끝나면(또는 판정으로 넘어가면) 끊을 것이 없으니 창을 내린다. 남겨 두면 다음 턴이 시작될 때 옛 창이 다시 뜬다
  useEffect(() => {
    if (!guardLeave) setPendingLeave(null)
  }, [guardLeave])

  const startNewChat = useCallback(() => {
    if (guardLeave) setPendingLeave({ to: 'new' })
    else leave({ to: 'new' })
  }, [guardLeave, leave])

  const selectFromSidebar = useCallback(
    (id: string) => {
      // 지금 대화를 다시 누르면 끊기지 않으므로(#359) 묻지 않는다
      if (guardLeave && id !== chat.activeId) setPendingLeave({ to: 'select', id })
      else leave({ to: 'select', id })
    },
    [guardLeave, chat.activeId, leave],
  )

  const sidebar = (
    <Sidebar
      conversations={chat.conversations}
      activeId={chat.activeId}
      onSelect={selectFromSidebar}
      onNew={startNewChat}
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
            className={headerIconBtn}
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
                  maxLength={MAX_TITLE_CHARS}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => {
                    if (!skipBlurRef.current) commitTitle()
                  }}
                  onKeyDown={(e) => {
                    // 한글 조합을 끝내려고 누른 Enter 로 편집을 닫지 않는다(#385)
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      skipBlurRef.current = true
                      commitTitle()
                    } else if (e.key === 'Escape') {
                      skipBlurRef.current = true
                      setEditingTitle(false)
                    }
                  }}
                  className="w-full max-w-xs rounded-lg border border-line bg-raised px-2.5 py-1.5 text-base font-semibold md:text-[15px] text-ink outline-none focus:border-accent focus:shadow-[0_0_0_4px_var(--c-focus-ring)]"
                />
              ) : (
                <button
                  onClick={() => {
                    setTitleDraft(activeTitle ?? '')
                    skipBlurRef.current = false
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
            className={headerIconBtn}
            onClick={startNewChat}
            aria-label="새 채팅"
          >
            <IconEdit />
          </button>
        </header>

        {/* 스크롤 페이드 - 입력창 뒤로 글이 잘리지 않고 사라지게 함 */}
        <div className="relative min-h-0 flex-1">
          <div className="h-full overflow-y-auto">
            {chat.loadingMessages ? (
              // 이력이 오는 동안 직전 대화나 빈 화면 안내 대신 로딩 표시(#291) - 모바일 · 데스크탑 같은 자리
              <div role="status" aria-label="대화 불러오는 중" className="grid h-full place-items-center">
                <div className="flex flex-col items-center gap-3 text-sm text-ink-muted">
                  <span className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-accent motion-reduce:animate-none" />
                  불러오는 중…
                </div>
              </div>
            ) : (
              <MessageList messages={chat.messages} stage={chat.stage} />
            )}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-canvas to-transparent" />
        </div>

        {chat.error && (
          <div role="alert" className="px-4 pb-1 text-center text-[13px] text-danger">{chat.error}</div>
        )}

        <Composer
          onSend={chat.send}
          streaming={chat.streaming}
          settling={chat.settling}
          busy={chat.loadingMessages || chat.creating}
          onStop={chat.stop}
        />
      </div>

      {pendingLeave && (
        <ConfirmModal
          title="답변을 중단하고 이동할까요?"
          message="답변 생성이 멈추고, 지금까지 받은 부분만 남습니다. 답이 시작되기 전이면 보낸 질문도 남지 않습니다."
          confirmLabel="중단하고 이동"
          onConfirm={() => {
            leave(pendingLeave)
            setPendingLeave(null)
          }}
          onCancel={() => setPendingLeave(null)}
        />
      )}
    </div>
  )
}
