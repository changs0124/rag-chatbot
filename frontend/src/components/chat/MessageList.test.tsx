import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MessageList from './MessageList'
import type { ChatMessage } from '../../lib/types'

describe('MessageList', () => {
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

  it('shows empty state when there are no messages', () => {
    render(<MessageList messages={[]} />)
    expect(screen.getByText(/무엇이든 물어보세요/)).toBeInTheDocument()
  })
})
