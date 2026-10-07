import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import ChatPage from './ChatPage'

/*
 * 모바일 헤더 로고의 **접근 가능한 이름**만 본다(#154).
 *
 * 헤더 마크를 무조건 aria-hidden 으로 두면 「모바일 · 드로어 닫힘」에서 화면에 브랜드 이름이
 * 하나도 남지 않는다 - 데스크톱 사이드바는 display:none 이고 드로어는 DOM 에 아예 없기 때문이다.
 * 반대로 열림 상태에서 숨기지 않으면 드로어 안 사이드바 로고와 겹쳐 이름이 두 번 읽힌다.
 * 양쪽을 다 잡아야 의미가 있어 성공·실패 한 쌍으로 둔다.
 *
 * **jsdom 은 Tailwind 를 적용하지 않는다.** `hidden md:block` 데스크톱 사이드바가 트리에 그대로
 * 남으므로 화면 전체에서 로고를 찾으면 닫힘 상태에서도 2개가 잡힌다. 그래서 헤더(banner)로
 * 범위를 좁혀서 본다 - 실제 브라우저의 「보이는 것」과는 다르지만, 이 검사가 보려는 것은
 * **헤더 마크 한 요소의 속성**이라 범위를 좁히는 쪽이 정확하다.
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

/** 헤더 안의 D 마크. variant="mark" 의 viewBox 로 집는다 - 이름이 없을 때도 잡혀야 해서 role 로는 못 찾는다 */
function headerMark(): SVGElement {
  const el = screen.getByRole('banner').querySelector('svg[viewBox="0 0 69.394 69.394"]')
  if (!el) throw new Error('헤더에 D 마크가 없다')
  return el as SVGElement
}

function renderChatPage() {
  render(
    <BrowserRouter>
      <ChatPage />
    </BrowserRouter>,
  )
}

describe('ChatPage 모바일 헤더 로고', () => {
  it('드로어가 닫혀 있으면 헤더 로고가 이름을 읽어 준다', () => {
    renderChatPage()

    expect(within(screen.getByRole('banner')).getByRole('img', { name: '디인사이트' })).toBeInTheDocument()
    expect(headerMark()).not.toHaveAttribute('aria-hidden')
  })

  it('드로어가 열려 있으면 헤더 로고를 스크린리더에서 숨긴다', () => {
    renderChatPage()
    fireEvent.click(screen.getByRole('button', { name: '대화 목록 열기' }))

    expect(within(screen.getByRole('banner')).queryByRole('img', { name: '디인사이트' })).toBeNull()
    expect(headerMark()).toHaveAttribute('aria-hidden', 'true')
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
