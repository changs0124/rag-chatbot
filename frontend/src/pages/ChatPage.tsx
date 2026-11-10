import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChat } from '../hooks/useChat'
import Sidebar from '../components/chat/Sidebar'
import ResizableSidebar from '../components/chat/ResizableSidebar'
import MessageList from '../components/chat/MessageList'
import Composer from '../components/chat/Composer'
import ConfirmModal from '../components/ConfirmModal'
import { IconClose, IconMenu } from '../components/icons'
import { useModalFocus } from '../hooks/useModalFocus'
import { MAX_TITLE_CHARS } from '../lib/limits'

// 헤더 왼쪽의 모바일 전용 아이콘 버튼(목록 열기)(#390). 오른쪽 새 채팅 버튼은 #670 에서 뺐다 - 새 대화는 사이드바(드로어)의 「새 대화」로
const headerIconBtn =
  'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-muted transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface hover:text-ink md:hidden'

// 확인을 기다리는 이동 - 새 채팅 또는 다른 대화(#503)
type LeaveTarget = { to: 'new' } | { to: 'select'; id: string }

// 한 번 열린 가상 키보드의 높이(#682) - 화면 방향마다 다르므로 레이아웃 높이(innerHeight)를 열쇠로 둔다.
// 모듈에 두는 이유 : 채팅 화면을 떠났다 돌아와도 다시 배울 필요가 없다. 페이지를 새로 읽으면 처음부터 다시 배운다
const keyboardInsets = new Map<number, number>()
// 주소창이 접히고 펴지는 정도(수십 px)는 키보드로 치지 않는다
const KEYBOARD_MIN_PX = 120
// 가상 키보드를 띄우는 입력칸 - 버튼 · 체크박스 등으로 포커스가 옮겨 가면 키보드가 내려간다
const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'range', 'color', 'image', 'hidden'])
function isTextEntry(el: EventTarget | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type)
  return el instanceof HTMLElement && el.isContentEditable
}

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

  // 키보드가 열고 닫히는 동안 루트 높이를 바꾸는 자리(#221) - 상태가 아니라 DOM 에 바로 쓴다(#668)
  const rootRef = useRef<HTMLDivElement>(null)
  // 마크다운 청크를 미리 받아 둔다(#417) - 첫 답변 자리에서 평문→서식 깜빡임과, 오래 열어 둔 탭이 재배포 뒤 옛 청크를 찾는 창을 줄인다.
  // 실패는 무시한다 - 그리는 쪽(MessageList)이 평문으로 물러선다
  useEffect(() => {
    import('../components/chat/Markdown').catch(() => {})
  }, [])
  // 모바일에서 헤더가 밀려 올라가지 않게 함(#221). 실기기 브라우저 고유 동작 둘을 막는다 -
  // ① iOS 는 문서가 스크롤되지 않아도 가장자리에서 페이지 전체를 고무줄처럼 튕긴다 → 채팅 화면이 떠 있는
  //   동안만 문서 스크롤과 튕김을 끈다(관리·설정 화면은 문서 스크롤을 그대로 쓴다).
  // ② 키보드가 열리면 100dvh 는 그대로이고 보이는 영역(visualViewport)만 줄며 입력 쪽으로 이동한다 →
  //   루트 높이를 보이는 영역에 맞추고 끌려 올라간 문서를 되돌린다. Android Chrome 은 index.html 의
  //   interactive-widget=resizes-content 로 레이아웃 자체가 줄어 같은 결과가 된다.
  // 헤드리스 브라우저는 가상 키보드와 튕김을 재현하지 못해 실기기로만 확인된다
  // 높이는 React 상태가 아니라 루트 요소에 바로 쓴다(#668) - 상태로 두면 이벤트마다 채팅 화면 전체(메시지 목록 · 마크다운 ·
  // 사이드바)가 다시 그려졌다. 같은 높이면 건너뛰고, 문서가 실제로 밀렸을 때만 되돌린다.
  // #682 (iPhone 실기기 보고 : 열릴 때 「축소됐다가 맞춰짐」, 닫힐 때 「다 내려간 뒤에야 늘어남」) -
  //  · iOS Safari 는 visualViewport resize 를 키보드 애니메이션이 **끝난 뒤** 보낸다(WebKit bug 300523 · 198347).
  //    그래서 이벤트만 기다리면 열릴 때는 Safari 가 입력칸을 보이려고 화면 전체를 위로 민 다음에야 높이를 맞추고(두 번 움직임),
  //    닫힐 때는 키보드가 다 사라진 뒤에야 늘어난다. interactive-widget 은 Safari 가 지원하지 않는다(WebKit bug 259770)
  //  · 닫힐 때 : 입력칸 focusout(키보드가 내려가기 시작하는 때)에 높이를 바로 지운다 - 다른 입력칸으로 옮겨 가면 그대로 둔다
  //  · 열릴 때 : 한 번 연 키보드 높이를 기억해 두고, 다음부터는 입력칸을 **누르는 순간**(touchstart · pointerdown) 그만큼 미리 줄인다(#687).
  //    #682 는 focusin 에 줄였는데 실기기에서 매번 「입력칸이 화면 위 끝까지 올라갔다 내려옴」 - focusin 은 Safari 가 입력칸을
  //    보이게 밀지 정한 뒤라, 루트가 줄어든 위에 Safari 의 밀기까지 겹쳐 두 번 움직였다. 누르는 순간은 포커스(손을 뗄 때)보다
  //    앞이라 그 판단 전에 레이아웃이 반영된다. focusin 은 키보드로 옮겨 온 포커스 · 프로그램 포커스를 위해 그대로 둔다.
  //    누르고 포커스가 오지 않으면(끌기 · 길게 누르기) 되돌린다. 첫 번째 열림은 높이를 몰라 예전처럼 끝난 뒤 맞춘다
  //  · 그래도 밀리면 따라간다(#687) : 문서 스크롤을 꺼 둔 상태라 Safari 가 문서 대신 보이는 영역을 미는 경우(scrollY 0 · visualViewport.offsetTop > 0
  //    - scrollTo(0,0) 로는 안 돌아온다 · 실기기 증상에서 세운 가설). 루트를 offsetTop 만큼 내려(translateY) 보이는 영역 맨 위에 붙인다. 확대 중 · 키보드가 닫히면 푼다.
  //    offsetTop 은 밀기가 끝난 뒤에야 갱신되고(WebKit bug 218465) 키보드가 떠 있는 동안 fixed/뷰포트 계산이 어긋난다(WebKit bug 191204) -
  //    그래서 이것은 보정이고, 주된 처방은 위의 「누르는 순간 미리 줄이기」다. **실기기 확인 필요**
  //  · 이벤트 반영은 프레임을 기다리지 않는다(#668 의 requestAnimationFrame 한 프레임 지연을 없앰) - React 를 거치지 않아 즉시여도 싸다
  useEffect(() => {
    const html = document.documentElement
    const prev = { overflow: html.style.overflow, overscroll: html.style.overscrollBehavior }
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'

    const vv = window.visualViewport
    // 사용자가 손가락으로 확대한 동안은 손대지 않는다 - 확대된 보이는 영역 높이를 루트에 넣으면 화면이
    // 짧아지고, 문서를 되돌리면 확대해서 보던 자리를 잃는다(#221). 입력 포커스 확대는 글자 16px 로 막았다
    const zoomed = () => !vv || Math.abs(vv.scale - 1) > 0.01
    const setHeight = (value: string) => {
      const root = rootRef.current
      if (root && root.style.height !== value) root.style.height = value
    }
    // 보이는 영역이 밀린 만큼 루트를 따라 내린다(#687) - 0 이면 지운다
    const follow = (offset: number) => {
      const root = rootRef.current
      const value = offset > 0 ? `translateY(${offset}px)` : ''
      if (root && root.style.transform !== value) root.style.transform = value
    }
    const unpan = () => {
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0)
    }
    const keyboardOpen = () => !!vv && vv.height < window.innerHeight - KEYBOARD_MIN_PX
    const apply = () => {
      if (!vv || zoomed()) {
        follow(0)
        return
      }
      // 레이아웃 높이(innerHeight)에서 보이는 영역이 줄어든 만큼이 키보드다. 화면 방향마다 다르니 innerHeight 를 열쇠로 둔다.
      // 주소창 접힘 같은 작은 차이는 키보드로 치지 않는다
      const inset = window.innerHeight - vv.height
      if (inset > KEYBOARD_MIN_PX) keyboardInsets.set(window.innerHeight, inset)
      setHeight(`${vv.height}px`)
      unpan()
      follow(keyboardOpen() ? vv.offsetTop : 0)
    }
    // 기억한 키보드 높이만큼 미리 줄인다 - 확대 중이 아니고, 채팅 화면 안 텍스트 입력이고, 키보드가 아직 안 떠 있을 때만
    const preshrink = (target: EventTarget | null) => {
      if (zoomed() || !isTextEntry(target) || !rootRef.current?.contains(target as Node)) return false
      const inset = keyboardInsets.get(window.innerHeight)
      // 키보드가 이미 떠 있으면(입력칸 사이 이동) 보이는 영역이 이미 줄어 있다 - 다시 줄이지 않는다
      if (!inset || keyboardOpen()) return false
      setHeight(`${window.innerHeight - inset}px`)
      unpan()
      return true
    }
    // 누르고도 포커스가 오지 않으면(끌기 · 길게 눌러 메뉴) 미리 줄인 높이를 되돌린다
    let undoTimer: ReturnType<typeof setTimeout> | undefined
    const PRESS_FOCUS_MS = 600
    const onPress = (e: Event) => {
      if (!preshrink(e.target) || e.target === document.activeElement) return
      clearTimeout(undoTimer)
      undoTimer = setTimeout(() => {
        if (!isTextEntry(document.activeElement) && !keyboardOpen()) setHeight('')
      }, PRESS_FOCUS_MS)
    }
    const onFocusIn = (e: FocusEvent) => {
      clearTimeout(undoTimer)
      preshrink(e.target)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (zoomed() || !isTextEntry(e.target) || isTextEntry(e.relatedTarget)) return
      setHeight('')
      follow(0)
      unpan()
    }
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    // 손가락이 닿는 순간 - 포커스는 손을 뗄 때 온다. 마우스(데스크톱)는 기억한 높이가 없어 아무 일도 없다
    document.addEventListener('touchstart', onPress, { passive: true })
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      clearTimeout(undoTimer)
      html.style.overflow = prev.overflow
      html.style.overscrollBehavior = prev.overscroll
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      document.removeEventListener('touchstart', onPress)
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  // 드로어가 열린 채 md 폭이 되면(폰을 가로로 돌림) 드로어는 md:hidden 으로 사라지는데 바깥 inert · 스크롤 잠금은 남아
  // 앱 전체가 눌리지 않는다(#656) - 넓어지는 순간 드로어를 닫는다. md 는 Tailwind 기본 768px
  useEffect(() => {
    if (!sidebarOpen) return
    const mq = window.matchMedia?.('(min-width: 768px)')
    if (!mq) return
    const onChange = () => {
      if (mq.matches) setSidebarOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [sidebarOpen])

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
      loading={chat.conversationsLoading}
      failed={chat.conversationsFailed}
      onRetry={chat.retryConversations}
    />
  )

  return (
    // h-screen 이 아니라 100dvh - iOS 주소창이 접힐 때 입력창이 화면 밖으로 밀리는 것을 막음.
    // 키보드가 열려 보이는 영역이 바뀐 뒤에는 그 높이를 따른다(#221) - 위 효과가 rootRef 에 바로 쓴다(#668)
    <div ref={rootRef} className="flex h-[100dvh] bg-canvas">
      <div className="hidden md:block">
        <ResizableSidebar>{sidebar}</ResizableSidebar>
      </div>

      {sidebarOpen && <MobileDrawer onClose={() => setSidebarOpen(false)}>{sidebar}</MobileDrawer>}

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
                  aria-label="대화 제목"
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
                  className="w-full max-w-xs rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 text-base font-semibold md:text-[15px] text-ink outline-none focus:border-accent focus:shadow-[0_0_0_4px_var(--c-focus-ring)]"
                />
              ) : (
                <button
                  onClick={() => {
                    setTitleDraft(activeTitle ?? '')
                    skipBlurRef.current = false
                    setEditingTitle(true)
                  }}
                  title="제목 변경"
                  className="min-h-11 max-w-full truncate rounded-lg px-2.5 py-1.5 text-[15px] font-semibold text-ink transition-colors md:min-h-0 duration-150 ease-[var(--ease-out-quint)] hover:bg-surface"
                >
                  {activeTitle ?? '새 대화'}
                </button>
              )
            ) : /* activeId 가 없으면(새 대화) 제목을 비운다(#670) - 빈 화면의 「무엇을 도와드릴까요?」 하나만 남긴다 */ null}
          </div>
        </header>

        {/* 스크롤 페이드 - 입력창 뒤로 글이 잘리지 않고 사라지게 함 */}
        <div className="relative min-h-0 flex-1">
          {/* 로딩 안내는 늘 있는 그릇에 글만 넣는다(#484 규칙 · #590) - 로딩 표시와 함께 끼웠다 빼면 낭독기가 놓친다 */}
          <p role="status" data-testid="loading-status" className="sr-only">
            {chat.loadingMessages ? '대화 불러오는 중' : ''}
          </p>
          {/* relative : 목록 끝 sr-only(absolute) 상태 줄의 기준 상자를 이 스크롤 상자로 묶는다 - 없으면 줄이 밖으로 나가 문서가 길어지고 scrollIntoView 가 화면 전체를 민다(#642) */}
          <div className="relative h-full overflow-y-auto">
            {chat.loadingMessages ? (
              // 이력이 오는 동안 직전 대화나 빈 화면 안내 대신 로딩 표시(#291) - 모바일 · 데스크탑 같은 자리
              // 스켈레톤(#646) - 돌아가는 원 대신 올 대화의 모양(질문 말풍선 + 답변 줄)을 미리 깐다. 움직임 줄이기면 깜빡임을 끈다
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
                <div aria-hidden="true" className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none">
                  <div className="ml-auto h-11 w-2/5 rounded-3xl bg-highlight" />
                  <div className="space-y-3">
                    <div className="h-3.5 w-11/12 rounded-full bg-highlight" />
                    <div className="h-3.5 w-4/5 rounded-full bg-highlight" />
                    <div className="h-3.5 w-3/5 rounded-full bg-highlight" />
                  </div>
                  <div className="ml-auto h-11 w-1/4 rounded-3xl bg-highlight" />
                  <div className="space-y-3">
                    <div className="h-3.5 w-10/12 rounded-full bg-highlight" />
                    <div className="h-3.5 w-2/3 rounded-full bg-highlight" />
                  </div>
                </div>
                <p className="text-center text-[13px] text-ink-muted">불러오는 중…</p>
              </div>
            ) : (
              <MessageList messages={chat.messages} stage={chat.stage} onAttachmentError={chat.refreshAttachment} />
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

// 모바일 대화 목록 드로어(#644, #105 F9) - 대화창으로 읽히고, Esc 로 닫히고, 열리면 포커스가 안으로 · 닫히면 햄버거로 돌아간다.
// 화면 전체를 덮고 오른쪽 위 X 로 닫는다(#669, ChatGPT · Claude 모바일과 같은 모양) - 덮인 배경이 없어 배경 탭 닫기는 없다.
// X 는 사이드바 머리 줄(로고, 왼쪽)의 오른쪽 빈자리에 둔다 - 사이드바는 데스크톱과 같은 컴포넌트라 X 는 드로어에만 있다.
// Esc 는 드로어 안의 확인 창(대화 삭제)이 받은 것이면 넘긴다 - 확인 창만 닫혀야 한다
function MobileDrawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useModalFocus<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className="fixed inset-0 z-40 bg-surface md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="대화 목록"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        if ((e.target as Element).closest('[aria-modal="true"]') !== e.currentTarget) return
        onClose()
      }}
    >
      {children}
      <button
        type="button"
        onClick={onClose}
        aria-label="대화 목록 닫기"
        className="absolute top-2.5 right-3 grid h-11 w-11 place-items-center rounded-xl text-ink-muted transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-raised hover:text-ink"
      >
        <IconClose className="h-5 w-5" />
      </button>
    </div>
  )
}
