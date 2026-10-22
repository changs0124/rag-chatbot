import { describe, it, expect, vi } from 'vitest'
import { Component, type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import MessageList from './MessageList'
import type { ChatMessage } from '../../lib/types'

/*
 * 마크다운 청크를 못 받으면 평문으로 물러선다(#417). 재배포로 옛 해시 청크가 사라지면 SPA 리라이트가 HTML 을 돌려줘
 * 모듈 로드가 실패한다 - 그 오류가 최상위 ErrorBoundary 까지 가면 앱 전체가 오류 화면이 된다.
 * 청크 실패는 모듈 단위로 굳으므로 성공 경로(MessageListLazy)와 파일을 나눈다.
 */
vi.mock('./Markdown', () => {
  throw new Error('청크 로드 실패')
})

// 최상위(main.tsx)와 같은 역할 - 오류가 여기까지 올라오면 앱 전체가 이 화면으로 바뀐다
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p>문제가 발생했습니다</p> : this.props.children
  }
}

describe('MessageList 마크다운 청크 실패 (#417)', () => {
  it('청크를 못 받아도 답변은 평문으로 남고 화면이 무너지지 않는다', async () => {
    const message: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '핀은 **CN3** 이다',
      status: 'complete',
      citations: [{ seq: 1, sourceName: '매뉴얼', snippet: '' }],
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <Boundary>
        <MessageList messages={[message]} />
      </Boundary>,
    )

    // 청크 실패가 처리될 때까지 기다린다 - 고치기 전에는 여기서 경계가 오류 화면으로 바뀐다
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(screen.queryByText('문제가 발생했습니다')).not.toBeInTheDocument()
    expect(screen.getByText('핀은 **CN3** 이다')).toBeInTheDocument()
    expect(screen.getByText('매뉴얼')).toBeInTheDocument()
  })
})
