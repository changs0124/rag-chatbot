import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import MessageList from './MessageList'
import type { ChatMessage } from '../../lib/types'

describe('MessageList', () => {
  // vitest globals 미사용이라 RTL 자동 정리가 안 걸림 - 렌더가 누적되지 않게 직접 정리함
  afterEach(cleanup)

  it('renders assistant content with its citations', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '환불 정책', status: 'complete', createdAt: '', citations: [] },
      {
        id: 'a1',
        role: 'assistant',
        content: '안내는 다음과 같음 [1]',
        status: 'complete',
        createdAt: '',
        citations: [{ seq: 1, sourceName: '이용 정책 문서', snippet: '발췌', uri: 'corpus://1' }],
      },
    ]
    render(<MessageList messages={messages} />)
    expect(screen.getByText('안내는 다음과 같음 [1]')).toBeInTheDocument()
    expect(screen.getByText('출처')).toBeInTheDocument()
    expect(screen.getByText('이용 정책 문서')).toBeInTheDocument()
  })

  it('marks an assistant answer with no citations as 자료 없음', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '일반적인 관점에서 이렇게 볼 수 있음.',
        status: 'complete',
        createdAt: '',
        citations: [],
      },
    ]
    render(<MessageList messages={messages} />)
    // 접두가 본문에 섞이지 않고 별도 표시로 나와야 함(화면·재조회 동일 규칙)
    expect(screen.getByText(/자료 없음/)).toBeInTheDocument()
    expect(screen.getByText('일반적인 관점에서 이렇게 볼 수 있음.')).toBeInTheDocument()
  })

  it('중단된 답변에는 자료 없음을 붙이지 않음', () => {
    // 중단은 출처 판정 전에 끝나므로 citations 가 늘 0건임 - 배너를 붙이면 100% 거짓말이 됨
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '답변을 쓰다가',
        status: 'complete',
        stopped: true,
        createdAt: '',
        citations: [],
      },
    ]
    render(<MessageList messages={messages} />)
    expect(screen.queryByText(/자료 없음/)).not.toBeInTheDocument()
    expect(screen.getByText('답변을 쓰다가')).toBeInTheDocument()
  })

  it('does not mark an answer that has citations', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '안내는 다음과 같음 [1]',
        status: 'complete',
        createdAt: '',
        citations: [{ seq: 1, sourceName: '이용 정책 문서', snippet: '발췌', uri: 'corpus://1' }],
      },
    ]
    render(<MessageList messages={messages} />)
    expect(screen.queryByText(/자료 없음/)).not.toBeInTheDocument()
  })

  it('shows empty state when there are no messages', () => {
    render(<MessageList messages={[]} />)
    expect(screen.getByText(/무엇이든 물어보세요/)).toBeInTheDocument()
  })

  // R-11 진행 단계 표시
  const pending: ChatMessage[] = [
    { id: 'u1', role: 'user', content: '환불 정책', status: 'complete', createdAt: '', citations: [] },
    { id: 'a1', role: 'assistant', content: '', status: 'streaming', createdAt: '', citations: [] },
  ]

  it('shows the stage label in a status region separated from the log', () => {
    render(<MessageList messages={pending} stage="목업 코퍼스 조회 중" />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('목업 코퍼스 조회 중')
    expect(status).toHaveAttribute('aria-atomic', 'true')
    // log 영역 안에 중첩되면 낭독이 누적되므로 분리되어야 함
    expect(screen.getByRole('log')).not.toContainElement(status)
    // 고정 문구는 제거됨(중복 표시 0건)
    expect(screen.queryByText('응답 생성 중…')).not.toBeInTheDocument()
  })

  it('holds the stage line while it is still within its minimum display time', () => {
    // 토큰이 이미 도착했어도 단계가 살아 있는 동안은 단계 줄을 유지함(최소 표시 시간)
    const streamedWithStage: ChatMessage[] = [
      pending[0],
      { ...pending[1], content: '문의하신 내용에 대한' },
    ]
    render(<MessageList messages={streamedWithStage} stage="답변 작성 중(목업)" />)
    expect(screen.getByRole('status')).toHaveTextContent('답변 작성 중(목업)')
    expect(screen.queryByText('문의하신 내용에 대한')).not.toBeInTheDocument()
  })

  it('replaces the stage line with answer text once tokens arrive', () => {
    const streamed: ChatMessage[] = [
      pending[0],
      { ...pending[1], content: '문의하신 내용에 대한 안내는' },
    ]
    render(<MessageList messages={streamed} stage={null} />)
    expect(screen.getByText('문의하신 내용에 대한 안내는')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps no stage line when the turn ended by abort or error', () => {
    const ended: ChatMessage[] = [
      pending[0],
      { ...pending[1], status: 'error' },
    ]
    render(<MessageList messages={ended} stage={null} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText(/응답 중 오류가 발생했습니다/)).toBeInTheDocument()
  })
})
