import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import ChatPage from './ChatPage'

/*
 * 모바일 헤더에는 로고를 두지 않는다(#235). 로고는 드로어를 열었을 때 사이드바 상단에만 나온다.
 *
 * **jsdom 은 Tailwind 를 적용하지 않는다.** `hidden md:block` 데스크톱 사이드바가 트리에 그대로
 * 남으므로 화면 전체에서 로고를 세면 닫힘 상태에서도 1개가 잡힌다. 그래서 헤더(banner)는 범위를
 * 좁혀 「없음」을 보고, 드로어는 열기 전후의 개수 차이로 본다.
 */

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { name: '사용자' }, logout: vi.fn() }),
}))

// 이력 불러오는 중인지 테스트마다 바꾼다(#291)
const chatState = vi.hoisted(() => ({
  loadingMessages: false,
  // 제목 수정 입력은 활성 대화가 있어야 뜬다(#371)
  conversations: [] as { id: string; title: string }[],
  activeId: null as string | null,
  error: null as string | null,
  // 제목 저장 호출을 세려고 렌더마다 같은 함수를 쓴다(#483 F5)
  renameConversation: vi.fn(),
  // 이동 확인창(#503) - 답을 받는 중인지 · 판정 중인지와 이동 호출
  streaming: false,
  settling: false,
  selectConversation: vi.fn(),
  newConversation: vi.fn(),
}))

vi.mock('../hooks/useChat', () => ({
  useChat: () => ({
    conversations: chatState.conversations,
    activeId: chatState.activeId,
    messages: [],
    loadingMessages: chatState.loadingMessages,
    streaming: chatState.streaming,
    settling: chatState.settling,
    stage: null,
    error: chatState.error,
    send: vi.fn(),
    stop: vi.fn(),
    selectConversation: chatState.selectConversation,
    newConversation: chatState.newConversation,
    deleteConversation: vi.fn(),
    renameConversation: chatState.renameConversation,
  }),
}))

function renderChatPage() {
  render(
    <BrowserRouter>
      <ChatPage />
    </BrowserRouter>,
  )
}

describe('ChatPage 모바일 헤더 로고', () => {
  const LOGO = '디인사이트 대영산전(주) 창원공장'

  it('헤더에는 로고가 없다', () => {
    renderChatPage()

    expect(within(screen.getByRole('banner')).queryByRole('img', { name: /디인사이트/ })).toBeNull()
  })

  it('드로어를 열면 사이드바 로고가 하나 더 나오고 헤더에는 여전히 없다', () => {
    renderChatPage()
    expect(screen.getAllByRole('img', { name: LOGO })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '대화 목록 열기' }))

    expect(screen.getAllByRole('img', { name: LOGO })).toHaveLength(2)
    expect(within(screen.getByRole('banner')).queryByRole('img', { name: /디인사이트/ })).toBeNull()
  })
})

/*
 * 모바일 키보드·고무줄에 헤더가 밀려 올라가지 않게 하는 장치(#221).
 *
 * 실제 증상(가상 키보드 · iOS 튕김)은 jsdom 도 헤드리스 브라우저도 재현하지 못한다. 여기서 잠그는 것은
 * **장치가 걸려 있는가**다 - 보이는 영역이 줄면 루트가 그 높이를 따르고 끌려 올라간 문서를 되돌리는지,
 * 채팅 화면을 떠나면 문서 스크롤 잠금을 풀어 다른 페이지를 막지 않는지.
 */
describe('ChatPage 모바일 뷰포트 (#221)', () => {
  /** jsdom 에 없는 visualViewport 를 이벤트만 쏠 수 있게 흉내 냄 */
  function fakeVisualViewport(height: number) {
    const target = new EventTarget() as EventTarget & { height: number; scale: number }
    target.height = height
    target.scale = 1
    Object.defineProperty(window, 'visualViewport', { value: target, configurable: true })
    return target
  }

  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport')
    vi.restoreAllMocks()
  })

  it('보이는 영역이 줄면 루트가 그 높이를 따르고 문서 스크롤을 0 으로 되돌린다', () => {
    const vv = fakeVisualViewport(844)
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderChatPage()
    const root = screen.getByRole('banner').closest('div.flex-col')!.parentElement as HTMLElement

    vv.height = 500
    act(() => {
      vv.dispatchEvent(new Event('resize'))
    })

    expect(root.style.height).toBe('500px')
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('사용자가 확대한 동안에는 루트 높이도 문서 스크롤도 건드리지 않는다', () => {
    // 확대된 보이는 영역 높이를 루트에 넣으면 화면이 짧아져 입력 칸이 위로 솟는다(실기기 보고)
    const vv = fakeVisualViewport(844)
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderChatPage()
    const root = screen.getByRole('banner').closest('div.flex-col')!.parentElement as HTMLElement

    vv.scale = 1.2
    vv.height = 400
    act(() => {
      vv.dispatchEvent(new Event('resize'))
    })

    expect(root.style.height).toBe('')
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('채팅 화면에 있는 동안만 문서 스크롤·튕김을 끄고, 떠나면 되돌린다', () => {
    const { unmount } = render(
      <BrowserRouter>
        <ChatPage />
      </BrowserRouter>,
    )
    const html = document.documentElement
    expect(html.style.overflow).toBe('hidden')
    expect(html.style.overscrollBehavior).toBe('none')

    unmount()
    expect(html.style.overflow).toBe('')
    expect(html.style.overscrollBehavior).toBe('')
  })
})

describe('ChatPage 대화 불러오는 중 (#291)', () => {
  afterEach(() => {
    chatState.loadingMessages = false
  })

  it('이력이 오는 동안 본문에 로딩 표시를 보이고 빈 화면 안내는 숨긴다', () => {
    chatState.loadingMessages = true
    renderChatPage()

    expect(screen.getByRole('status', { name: '대화 불러오는 중' })).toHaveTextContent('불러오는 중')
    expect(screen.queryByText('무엇을 도와드릴까요?')).toBeNull()
  })

  it('불러오기가 끝나면 로딩 표시가 없다', () => {
    renderChatPage()

    expect(screen.queryByRole('status', { name: '대화 불러오는 중' })).toBeNull()
    expect(screen.getByText('무엇을 도와드릴까요?')).toBeInTheDocument()
  })
})

describe('ChatPage 제목 수정 (#371)', () => {
  afterEach(() => {
    chatState.conversations = []
    chatState.activeId = null
    chatState.renameConversation.mockClear()
  })

  // 서버 상한(app.chat.max-title-chars 기본값)과 같은 값 - 넘기면 서버가 400 으로 거절한다
  it('제목 입력은 100자까지만 받는다', () => {
    chatState.conversations = [{ id: 'c1', title: '대화' }]
    chatState.activeId = 'c1'
    renderChatPage()

    fireEvent.click(screen.getByTitle('제목 변경'))

    expect(screen.getByDisplayValue('대화')).toHaveAttribute('maxLength', '100')
  })

  // 조합을 끝내려고 누른 Enter 로 제목 편집이 닫히면 마지막 글자가 빠진 제목이 저장된다(#385)
  it('한글 조합 중 Enter 는 제목 편집을 닫지 않는다', () => {
    chatState.conversations = [{ id: 'c1', title: '대화' }]
    chatState.activeId = 'c1'
    renderChatPage()

    fireEvent.click(screen.getByTitle('제목 변경'))
    const input = screen.getByDisplayValue('대화')
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(screen.getByDisplayValue('대화')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByDisplayValue('대화')).not.toBeInTheDocument()
  })

  // #483 F5 : Chromium 은 포커스된 입력을 언마운트할 때 blur 를 낸다. jsdom 은 내지 않으므로 키와 같은 배치에서 직접 쏜다 -
  // 그 blur 의 onBlur 는 마지막 렌더의 초안을 들고 있어 Esc 가 저장으로, Enter 가 두 번 저장으로 바뀌면 안 된다
  it('Esc 뒤 blur 가 와도 제목을 저장하지 않는다', () => {
    chatState.conversations = [{ id: 'c1', title: '대화' }]
    chatState.activeId = 'c1'
    renderChatPage()

    fireEvent.click(screen.getByTitle('제목 변경'))
    const input = screen.getByDisplayValue('대화')
    fireEvent.change(input, { target: { value: '취소할 제목' } })
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' })
      fireEvent.blur(input)
    })

    expect(chatState.renameConversation).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue('취소할 제목')).not.toBeInTheDocument()
  })

  // 닫을 때 세운 표시가 남으면 다음 편집의 blur 저장까지 막힌다 - 편집을 열 때 내린다
  it('Enter 로 닫은 뒤 다시 열면 blur 로 저장된다', () => {
    chatState.conversations = [{ id: 'c1', title: '대화' }]
    chatState.activeId = 'c1'
    renderChatPage()

    fireEvent.click(screen.getByTitle('제목 변경'))
    fireEvent.keyDown(screen.getByDisplayValue('대화'), { key: 'Enter' })
    fireEvent.click(screen.getByTitle('제목 변경'))
    const input = screen.getByDisplayValue('대화')
    fireEvent.change(input, { target: { value: '다시 연 제목' } })
    fireEvent.blur(input)

    expect(chatState.renameConversation).toHaveBeenCalledTimes(1)
    expect(chatState.renameConversation).toHaveBeenCalledWith('c1', '다시 연 제목')
  })

  it('Enter 뒤 blur 가 와도 제목을 한 번만 저장한다', () => {
    chatState.conversations = [{ id: 'c1', title: '대화' }]
    chatState.activeId = 'c1'
    renderChatPage()

    fireEvent.click(screen.getByTitle('제목 변경'))
    const input = screen.getByDisplayValue('대화')
    fireEvent.change(input, { target: { value: '새 제목' } })
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.blur(input)
    })

    expect(chatState.renameConversation).toHaveBeenCalledTimes(1)
    expect(chatState.renameConversation).toHaveBeenCalledWith('c1', '새 제목')
  })
})

// #484 F6 : 스트림 오류 배너는 화면에 뜨는 즉시 낭독돼야 한다
describe('ChatPage 오류 배너 (#484)', () => {
  afterEach(() => {
    chatState.error = null
  })

  it('채팅 오류는 role=alert 로 나온다', () => {
    chatState.error = '답변을 받지 못했습니다'
    renderChatPage()

    expect(screen.getByRole('alert')).toHaveTextContent('답변을 받지 못했습니다')
  })
})

// #503 : 답을 받는 중에 다른 대화 · 새 채팅으로 옮기면 그 턴이 중단된다 - 옮기기 전에 묻는다
describe('ChatPage 답변 중 이동 확인 (#503)', () => {
  afterEach(() => {
    chatState.conversations = []
    chatState.activeId = null
    chatState.streaming = false
    chatState.settling = false
    chatState.selectConversation.mockClear()
    chatState.newConversation.mockClear()
  })

  function streamingIn(activeId: string) {
    chatState.conversations = [
      { id: 'c1', title: '첫 대화' },
      { id: 'c2', title: '둘째 대화' },
    ]
    chatState.activeId = activeId
    chatState.streaming = true
  }

  // jsdom 은 데스크톱 사이드바(hidden md:block)를 그대로 그리므로 첫 번째가 데스크톱 쪽이다
  const clickConversation = (title: string) => fireEvent.click(screen.getAllByText(title)[0])
  const clickNewChat = () => fireEvent.click(screen.getAllByRole('button', { name: '새 대화' })[0])

  it('답을 받는 중에 다른 대화를 누르면 확인창을 띄우고 아직 옮기지 않는다', () => {
    streamingIn('c1')
    renderChatPage()

    clickConversation('둘째 대화')

    expect(screen.getByRole('dialog', { name: '답변을 중단하고 이동할까요?' })).toBeInTheDocument()
    expect(chatState.selectConversation).not.toHaveBeenCalled()
  })

  it('확인하면 그 대화로 옮기고 확인창을 닫는다', () => {
    streamingIn('c1')
    renderChatPage()

    clickConversation('둘째 대화')
    fireEvent.click(screen.getByRole('button', { name: '중단하고 이동' }))

    expect(chatState.selectConversation).toHaveBeenCalledWith('c2')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('취소하면 옮기지 않고 확인창만 닫는다', () => {
    streamingIn('c1')
    renderChatPage()

    clickConversation('둘째 대화')
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(chatState.selectConversation).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('취소해도 모바일 드로어는 열린 채로 둔다', () => {
    streamingIn('c1')
    renderChatPage()
    fireEvent.click(screen.getByRole('button', { name: '대화 목록 열기' }))
    const before = screen.getAllByText('둘째 대화').length

    // 드로어 쪽(마지막) 항목을 누른다
    fireEvent.click(screen.getAllByText('둘째 대화').at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(screen.getAllByText('둘째 대화')).toHaveLength(before)
  })

  it('답을 받는 중에 새 채팅을 눌러도 먼저 묻는다 - 모바일 헤더 버튼도 같다', () => {
    streamingIn('c1')
    renderChatPage()

    fireEvent.click(screen.getByRole('button', { name: '새 채팅' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(chatState.newConversation).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '중단하고 이동' }))
    expect(chatState.newConversation).toHaveBeenCalledTimes(1)
  })

  it('사이드바의 새 대화 버튼도 먼저 묻는다', () => {
    streamingIn('c1')
    renderChatPage()

    clickNewChat()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(chatState.newConversation).not.toHaveBeenCalled()
  })

  it('답을 받는 중이 아니면 묻지 않고 바로 옮긴다', () => {
    streamingIn('c1')
    chatState.streaming = false
    renderChatPage()

    clickConversation('둘째 대화')
    clickNewChat()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(chatState.selectConversation).toHaveBeenCalledWith('c2')
    expect(chatState.newConversation).toHaveBeenCalledTimes(1)
  })

  it('판정(재확인) 중에는 묻지 않는다 - 옮기면 잠금만 풀린다(#489 리뷰)', () => {
    streamingIn('c1')
    chatState.settling = true
    renderChatPage()

    clickConversation('둘째 대화')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(chatState.selectConversation).toHaveBeenCalledWith('c2')
  })

  it('답을 받는 중인 지금 대화를 다시 누르면 묻지 않는다(#359)', () => {
    streamingIn('c1')
    renderChatPage()

    clickConversation('첫 대화')

    expect(screen.queryByRole('dialog')).toBeNull()
    // 끊지 않는 처리는 useChat 의 몫이다 - 화면은 그대로 넘긴다
    expect(chatState.selectConversation).toHaveBeenCalledWith('c1')
  })
})
