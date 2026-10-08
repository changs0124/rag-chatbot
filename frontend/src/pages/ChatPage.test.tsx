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

vi.mock('../hooks/useChat', () => ({
  useChat: () => ({
    conversations: [],
    activeId: null,
    messages: [],
    streaming: false,
    stage: null,
    error: null,
    send: vi.fn(),
    stop: vi.fn(),
    selectConversation: vi.fn(),
    newConversation: vi.fn(),
    deleteConversation: vi.fn(),
    renameConversation: vi.fn(),
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
