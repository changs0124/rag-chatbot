import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

afterEach(cleanup)

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
