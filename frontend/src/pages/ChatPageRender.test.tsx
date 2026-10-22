import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import ChatPage from './ChatPage'

/*
 * 스트리밍 중 토큰마다 ChatPage 가 다시 그려져도 사이드바는 다시 그리지 않는다(#405).
 *
 * 대화 상태가 ChatPage 의 useChat 에 모여 있어 토큰 하나에 페이지 전체가 다시 렌더된다. 사이드바에 넘기는
 * 값이 그대로면 대화 목록 전체를 다시 그릴 이유가 없다 - 인라인 핸들러가 매번 새 함수면 이 경계가 무너진다.
 * useChat 의 콜백은 실제처럼 같은 참조를 유지하게 두고, 메시지만 바꿔 다시 렌더한다.
 */
const state = vi.hoisted(() => ({
  sidebarRenders: 0,
  messages: [] as { id: string; role: 'assistant'; content: string; status: 'streaming'; citations: [] }[],
  conversations: [{ id: 'c1', title: '대화', createdAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T00:00:00Z' }],
  fns: {
    send: () => {},
    stop: () => {},
    selectConversation: () => {},
    newConversation: () => {},
    deleteConversation: () => {},
    renameConversation: () => {},
  },
  logout: () => {},
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { name: '사용자' }, logout: state.logout }),
}))

vi.mock('../hooks/useChat', () => ({
  useChat: () => ({
    conversations: state.conversations,
    activeId: 'c1',
    messages: state.messages,
    loadingMessages: false,
    streaming: true,
    creating: false,
    stage: null,
    error: null,
    ...state.fns,
  }),
}))

// 사이드바 렌더는 그 안의 로고로 센다 - 닫힌 모바일 드로어에는 사이드바가 없어 로고는 데스크톱 사이드바 하나뿐이다
vi.mock('../components/Logo', () => ({
  default: () => {
    state.sidebarRenders += 1
    return null
  },
}))

describe('ChatPage 스트리밍 재렌더 (#405)', () => {
  it('토큰이 붙어 페이지가 다시 그려져도 사이드바는 다시 그리지 않는다', () => {
    state.messages = [{ id: 'a1', role: 'assistant', content: '첫', status: 'streaming', citations: [] }]
    const tree = () => (
      <BrowserRouter>
        <ChatPage />
      </BrowserRouter>
    )
    const { rerender } = render(tree())
    const before = state.sidebarRenders

    state.messages = [{ ...state.messages[0], content: '첫 토큰' }]
    rerender(tree())

    expect(state.sidebarRenders).toBe(before)
  })
})
