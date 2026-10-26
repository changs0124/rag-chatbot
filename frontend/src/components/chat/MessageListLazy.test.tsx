import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MessageList from './MessageList'
import type { ChatMessage } from '../../lib/types'

/*
 * Markdown 은 지연 로딩이다(#417). React.lazy 는 한 번 해석되면 모듈 안에서 계속 해석된 채라,
 * 청크 도착 전 모습은 이 파일의 첫 렌더에서만 볼 수 있다 - 그래서 다른 테스트와 파일을 나눈다.
 */
describe('MessageList 마크다운 지연 로딩 (#417)', () => {
  it('청크가 오기 전에는 같은 글이 평문으로 보이고, 오면 서식으로 바뀐다', async () => {
    const message: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '핀은 **CN3** 이다',
      status: 'complete',
      citations: [{ seq: 1, sourceName: '매뉴얼', snippet: '' }],
    }
    render(<MessageList messages={[message]} />)
    expect(screen.getByText('핀은 **CN3** 이다')).toBeInTheDocument()

    // 청크 import 를 명시적으로 기다린 뒤 본다(#482) - 콜드 실행에서는 첫 변환이 findBy 기본 1초를 넘긴다
    await import('./Markdown')
    expect((await screen.findByText('CN3', {}, { timeout: 10_000 })).tagName).toBe('STRONG')
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument()
  }, 20_000)
})
