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
}))

vi.mock('../hooks/useChat', () => ({
  useChat: () => ({
    conversations: chatState.conversations,
    activeId: chatState.activeId,
    messages: [],
    loadingMessages: chatState.loadingMessages,
    streaming: false,
    stage: null,
    error: chatState.error,
    send: vi.fn(),
    stop: vi.fn(),
    selectConversation: vi.fn(),
    newConversation: vi.fn(),
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
